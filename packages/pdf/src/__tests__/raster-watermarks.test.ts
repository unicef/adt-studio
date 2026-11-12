import { describe, it, expect } from "vitest";
import mupdf from "mupdf";
import { extractPages } from "../extract.js";
import {
  detectRasterWatermark,
  renderPageWithoutRasterWatermark,
} from "../raster-watermarks.js";
import { decodePng } from "../png-utils.js";
import { createWatermarkedTestPdf } from "./create-test-pdf.js";

// Each page is a single full-page picture at exactly 100 DPI, like a PDF
// that was printed to PDF or scanned: there is no text or vector op at all.
const PAGE_W = 306;
const PAGE_H = 396;
const IMG_W = 425;
const IMG_H = 550;
const PAGE_COUNT = 16;
const STAMP_OPACITY = 0.3;

type Blend = "multiply" | "keep-colour";

/** Opacity of the synthetic stamp: three thin diagonal bars, soft-edged. */
function stampOpacity(x: number, y: number, peak: number = STAMP_OPACITY): number {
  const dx = x - IMG_W / 2;
  const dy = y - IMG_H / 2;
  const along = (dx - dy) / Math.SQRT2;
  const across = (dx + dy) / Math.SQRT2;
  if (Math.abs(along) > 120) return 0;
  let coverage = 0;
  for (const offset of [-30, 0, 30]) {
    coverage = Math.max(coverage, Math.min(1, Math.max(0, 2.5 - Math.abs(across - offset))));
  }
  return peak * coverage;
}

/** Deterministic noise in {-1, 0, 1}, standing in for compression noise. */
function noiseAt(seed: number): number {
  const v = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return ((v >>> 13) % 3) - 1;
}

const TINTS: Array<[number, number, number]> = [
  [251, 215, 232], // pink
  [254, 250, 195], // cream
  [127, 212, 245], // blue
];

interface Furniture {
  /** Light-grey 2px frame around the page, the same on every page. */
  frame?: boolean;
  /** Light-grey 3px rule across the foot of the page, the same on every page. */
  rule?: boolean;
}

/** Page content before stamping: paper, a tinted block, and lines of "text". */
function pagePixels(pageIndex: number, paper: number = 254, furniture: Furniture = {}): Uint8Array {
  const rgb = new Uint8Array(IMG_W * IMG_H * 3).fill(paper);
  const grey = (x: number, y: number): void => rgb.fill(200, (y * IMG_W + x) * 3, (y * IMG_W + x) * 3 + 3);
  if (furniture.frame) {
    for (let x = 10; x < IMG_W - 10; x++) for (const y of [10, 11, IMG_H - 12, IMG_H - 11]) grey(x, y);
    for (let y = 10; y < IMG_H - 10; y++) for (const x of [10, 11, IMG_W - 12, IMG_W - 11]) grey(x, y);
  }
  if (furniture.rule) {
    for (let x = 30; x < IMG_W - 30; x++) for (const y of [520, 521, 522]) grey(x, y);
  }
  const tint = TINTS[pageIndex % TINTS.length];
  const tintX = 40 + ((pageIndex * 61) % 200);
  const tintY = 60 + ((pageIndex * 131) % 330);
  for (let y = tintY; y < Math.min(IMG_H, tintY + 90); y++) {
    for (let x = tintX; x < tintX + 120; x++) {
      rgb.set(tint, (y * IMG_W + x) * 3);
    }
  }
  const textTop = 30 + ((pageIndex * 97) % 380);
  for (let line = 0; line < 9; line++) {
    const y0 = textTop + line * 14;
    for (let y = y0; y < Math.min(IMG_H, y0 + 2); y++) {
      for (let x = 30; x < 395; x++) {
        if ((x + line * 17) % 40 < 31) rgb.fill(20, (y * IMG_W + x) * 3, (y * IMG_W + x) * 3 + 3);
      }
    }
  }
  for (let i = 0; i < rgb.length; i++) {
    rgb[i] = Math.min(255, Math.max(0, rgb[i] + noiseAt(i + pageIndex * 7919)));
  }
  return rgb;
}

/** Stamp the page the way a flattening pipeline would. */
function stamp(rgb: Uint8Array, blend: Blend, peak: number = STAMP_OPACITY): Uint8Array {
  const out = new Uint8Array(rgb);
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < IMG_W; x++) {
      const a = stampOpacity(x, y, peak);
      if (a <= 0) continue;
      const i = (y * IMG_W + x) * 3;
      if (blend === "multiply") {
        for (let ch = 0; ch < 3; ch++) out[i + ch] = Math.round(rgb[i + ch] * (1 - a));
      } else {
        // Brightness darkened by the same share, colour differences kept.
        const luma = 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
        for (let ch = 0; ch < 3; ch++) out[i + ch] = Math.max(0, Math.round(rgb[i + ch] - a * luma));
      }
    }
  }
  return out;
}

/**
 * A pale coloured stamp with soft edges, as JPEG leaves them. Its body is
 * coloured, but the outer fringe of each bar is faint and nearly grey.
 */
function stampInColour(rgb: Uint8Array): Uint8Array {
  const colour = [215, 200, 190];
  const out = new Uint8Array(rgb);
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < IMG_W; x++) {
      const dx = x - IMG_W / 2;
      const dy = y - IMG_H / 2;
      if (Math.abs((dx - dy) / Math.SQRT2) > 120) continue;
      const across = (dx + dy) / Math.SQRT2;
      let coverage = 0;
      for (const offset of [-40, 40]) {
        coverage = Math.max(coverage, Math.min(1, Math.max(0, (8 - Math.abs(across - offset)) / 6)));
      }
      if (coverage <= 0) continue;
      const i = (y * IMG_W + x) * 3;
      for (let ch = 0; ch < 3; ch++) out[i + ch] = Math.round(rgb[i + ch] * (1 - coverage) + colour[ch] * coverage);
    }
  }
  return out;
}

function buildPdf(options: {
  blend?: Blend;
  /** Pages (0-based) left without the stamp. */
  unstamped?: number[];
  /** Embed the page pictures as JPEG instead of lossless. */
  jpeg?: boolean;
  pageCount?: number;
  /** Brightness of the paper (254 = white). */
  paper?: number;
  stampOpacity?: number;
  furniture?: Furniture;
  /** Width of the first page in points, when it differs from the rest. */
  firstPageWidth?: number;
  /** Give every picture a soft mask that makes its top strip transparent. */
  softMask?: boolean;
  /** Stamp in a pale colour instead of grey. */
  colouredStamp?: boolean;
}): Buffer {
  const {
    blend = "multiply",
    unstamped = [],
    jpeg = false,
    pageCount = PAGE_COUNT,
    paper = 254,
    stampOpacity: peak = STAMP_OPACITY,
    furniture = {},
    firstPageWidth,
    softMask = false,
    colouredStamp = false,
  } = options;
  const doc = new mupdf.PDFDocument();
  for (let p = 0; p < pageCount; p++) {
    const clean = pagePixels(p, paper, furniture);
    const stamped = colouredStamp ? stampInColour(clean) : stamp(clean, blend, peak);
    const pixels = unstamped.includes(p) ? clean : stamped;
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, IMG_W, IMG_H], false);
    pixmap.getPixels().set(pixels);
    let image: InstanceType<typeof mupdf.Image>;
    if (softMask) {
      const mask = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, IMG_W, IMG_H], false);
      mask.getPixels().fill(255);
      mask.getPixels().fill(0, 0, IMG_W * 20);
      image = new mupdf.Image(pixmap, new mupdf.Image(mask));
    } else {
      image = jpeg ? new mupdf.Image(pixmap.asJPEG(95, false)) : new mupdf.Image(pixmap);
    }
    const xobjects = doc.newDictionary();
    xobjects.put("Im1", doc.addImage(image));
    const resources = doc.newDictionary();
    resources.put("XObject", xobjects);
    const pageW = p === 0 && firstPageWidth ? firstPageWidth : PAGE_W;
    const stream = new mupdf.Buffer();
    stream.writeLine(`q ${pageW} 0 0 ${PAGE_H} 0 0 cm /Im1 Do Q`);
    doc.insertPage(-1, doc.addPage([0, 0, pageW, PAGE_H], 0, doc.addObject(resources), stream));
  }
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

/** Tight pixel box around the synthetic stamp. */
function stampBox(): [number, number, number, number] {
  let x0 = IMG_W, y0 = IMG_H, x1 = 0, y1 = 0;
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < IMG_W; x++) {
      if (stampOpacity(x, y) < 0.05) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
    }
  }
  return [x0, y0, x1, y1];
}

function openDoc(buffer: Buffer): InstanceType<typeof mupdf.PDFDocument> {
  return mupdf.PDFDocument.openDocument(buffer, "application/pdf") as InstanceType<
    typeof mupdf.PDFDocument
  >;
}

/** Mean and worst-case error against the unstamped page, over stamp pixels. */
function stampAreaError(
  actual: Uint8Array | Buffer,
  stride: number,
  expected: Uint8Array,
): { mean: number; badShare: number } {
  let sum = 0;
  let count = 0;
  let bad = 0;
  for (let y = 0; y < IMG_H; y++) {
    for (let x = 0; x < IMG_W; x++) {
      if (stampOpacity(x, y) < 0.05) continue;
      const p = y * IMG_W + x;
      let worst = 0;
      for (let ch = 0; ch < 3; ch++) {
        const diff = Math.abs(actual[p * stride + ch] - expected[p * 3 + ch]);
        sum += diff;
        worst = Math.max(worst, diff);
      }
      count += 3;
      if (worst > 16) bad++;
    }
  }
  return { mean: sum / count, badShare: bad / (count / 3) };
}

describe("detectRasterWatermark", () => {
  it("learns a stamp baked into full-page images", () => {
    const doc = openDoc(buildPdf({}));
    const model = detectRasterWatermark(doc);
    expect(model).not.toBeNull();
    if (!model) return;
    // Learned on the images' own 100 DPI grid.
    expect(model.scale).toBeCloseTo(100 / 72, 3);
    expect(model.pagesSampled).toBe(PAGE_COUNT);
    expect(model.peakOpacity).toBeGreaterThan(STAMP_OPACITY - 0.04);
    expect(model.peakOpacity).toBeLessThan(STAMP_OPACITY + 0.04);

    const [x0, y0, x1, y1] = stampBox();
    expect(Math.abs(model.box[0] - x0)).toBeLessThanOrEqual(4);
    expect(Math.abs(model.box[1] - y0)).toBeLessThanOrEqual(4);
    expect(Math.abs(model.box[2] - x1)).toBeLessThanOrEqual(4);
    expect(Math.abs(model.box[3] - y1)).toBeLessThanOrEqual(4);
  });

  it("finds nothing when the page images carry no stamp", () => {
    const everyPage = Array.from({ length: PAGE_COUNT }, (_, i) => i);
    expect(detectRasterWatermark(openDoc(buildPdf({ unstamped: everyPage })))).toBeNull();
  });

  it("ignores documents that are not made of page images", () => {
    // Text-stamp fixture: vector/text pages, handled by the text detector.
    expect(detectRasterWatermark(openDoc(createWatermarkedTestPdf(12)))).toBeNull();
  });

  it("does not guess from too few pages", () => {
    expect(detectRasterWatermark(openDoc(buildPdf({ pageCount: 5 })))).toBeNull();
  });

  it("does not take a repeated grey page frame or rule for a watermark", () => {
    const everyPage = Array.from({ length: PAGE_COUNT }, (_, i) => i);
    const furniture = { frame: true, rule: true };
    expect(detectRasterWatermark(openDoc(buildPdf({ unstamped: everyPage, furniture })))).toBeNull();
  });

  it("finds a faint stamp even when page furniture outweighs it", () => {
    const pdf = buildPdf({ stampOpacity: 0.1, furniture: { frame: true, rule: true } });
    const model = detectRasterWatermark(openDoc(pdf));
    expect(model).not.toBeNull();
    if (!model) return;
    // The stamp, not the frame (which would span the whole page).
    const [x0, y0, x1, y1] = stampBox();
    expect(Math.abs(model.box[0] - x0)).toBeLessThanOrEqual(6);
    expect(Math.abs(model.box[1] - y0)).toBeLessThanOrEqual(6);
    expect(Math.abs(model.box[2] - x1)).toBeLessThanOrEqual(6);
    expect(Math.abs(model.box[3] - y1)).toBeLessThanOrEqual(6);
  });

  it("does not mistake the soft edge of a coloured stamp for a grey one", () => {
    // Coloured stamps are out of scope; half-removing one would be worse.
    expect(detectRasterWatermark(openDoc(buildPdf({ colouredStamp: true })))).toBeNull();
  });

  it("learns from the common page size when the cover is a different size", () => {
    const model = detectRasterWatermark(openDoc(buildPdf({ firstPageWidth: 320 })));
    expect(model).not.toBeNull();
    expect(model?.pagesSampled).toBe(PAGE_COUNT - 1);
  });

  it("remembers the result for a document when given a key", () => {
    const doc = openDoc(buildPdf({}));
    const first = detectRasterWatermark(doc, "raster-watermark-test-key");
    expect(first).not.toBeNull();
    expect(detectRasterWatermark(doc, "raster-watermark-test-key")).toBe(first);
    expect(detectRasterWatermark(doc)).not.toBe(first);
  });
});

describe("renderPageWithoutRasterWatermark", () => {
  for (const blend of ["multiply", "keep-colour"] as const) {
    it(`restores what the stamp covered (${blend} blend)`, () => {
      const doc = openDoc(buildPdf({ blend }));
      const model = detectRasterWatermark(doc);
      expect(model).not.toBeNull();
      if (!model) return;

      // Pages 0..2 put a pink, cream and blue block under the stamp.
      for (const pageIndex of [0, 1, 2, 7]) {
        const result = renderPageWithoutRasterWatermark(doc.loadPage(pageIndex), 2, model);
        expect(result).not.toBeNull();
        if (!result) return;
        expect(result.cleaned).toHaveLength(1);
        const cleaned = result.cleaned[0];
        expect(cleaned.width).toBe(IMG_W);
        expect(cleaned.height).toBe(IMG_H);
        expect(cleaned.strength).toBeGreaterThan(0.85);
        expect(cleaned.strength).toBeLessThan(1.15);

        const truth = pagePixels(pageIndex);
        const before = stampAreaError(stamp(truth, blend), 3, truth);
        const after = stampAreaError(cleaned.pixels, 3, truth);
        expect(before.mean).toBeGreaterThan(20);
        expect(after.mean).toBeLessThan(3);
        expect(after.badShare).toBeLessThan(0.03);
      }
    });
  }

  it("measures the paper instead of assuming it is white", () => {
    const paper = 249;
    const doc = openDoc(buildPdf({ paper }));
    const model = detectRasterWatermark(doc);
    expect(model).not.toBeNull();
    if (!model) return;
    // Plain paper is not part of the stamp.
    const [x0, y0, x1, y1] = stampBox();
    expect(Math.abs(model.box[0] - x0)).toBeLessThanOrEqual(4);
    expect(Math.abs(model.box[3] - y1)).toBeLessThanOrEqual(4);

    const result = renderPageWithoutRasterWatermark(doc.loadPage(0), 2, model);
    expect(result?.cleaned).toHaveLength(1);
    if (!result) return;
    const cleaned = result.cleaned[0].pixels;
    const truth = pagePixels(0, paper);
    expect(stampAreaError(cleaned, 3, truth).mean).toBeLessThan(3);
    // Paper beside the stamp keeps its own level: no bleached halo.
    let drift = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (stampOpacity(x, y) > 0) continue;
        const p = (y * IMG_W + x) * 3;
        if (truth[p] < paper - 1) continue; // text or tint, not paper
        drift += cleaned[p] - truth[p];
        count++;
      }
    }
    expect(Math.abs(drift / count)).toBeLessThan(1);
  });

  it("leaves a page without the stamp alone", () => {
    const doc = openDoc(buildPdf({ unstamped: [4] }));
    const model = detectRasterWatermark(doc);
    expect(model).not.toBeNull();
    if (!model) return;
    const page = doc.loadPage(4);
    const standard = Buffer.from(
      page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false).asPNG(),
    );
    const result = renderPageWithoutRasterWatermark(page, 2, model);
    expect(result?.cleaned).toHaveLength(0);
    expect(result?.png.equals(standard)).toBe(true);
  });

  it("does not alter the image mupdf keeps cached for later renders", () => {
    const doc = openDoc(buildPdf({}));
    const model = detectRasterWatermark(doc);
    expect(model).not.toBeNull();
    if (!model) return;
    const page = doc.loadPage(3);
    const render = (): Buffer =>
      Buffer.from(page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false).asPNG());
    const before = render();
    expect(renderPageWithoutRasterWatermark(page, 2, model)?.cleaned).toHaveLength(1);
    expect(render().equals(before)).toBe(true);
  });
});

describe("extraction with removeWatermarks on image pages", () => {
  it("cleans the page render and the extracted image, and records what it did", async () => {
    const pdfBuffer = buildPdf({ unstamped: [4] });
    const groups = [[1], [4]];
    const [stampedOff, plainOff] = await extractPages({ pdfBuffer, groups });
    const [stampedOn, plainOn] = await extractPages({ pdfBuffer, groups, removeWatermarks: true });

    // Stamped page: the embedded picture is replaced by its cleaned copy.
    const truth = pagePixels(1);
    const rasterOff = stampedOff.images.find((img) => img.renderMethod === "raster");
    const rasterOn = stampedOn.images.find((img) => img.renderMethod === "raster");
    expect(rasterOff && rasterOn).toBeTruthy();
    if (!rasterOff || !rasterOn) return;
    expect(rasterOn.imageId).toBe(rasterOff.imageId);
    expect(rasterOn.format).toBe(rasterOff.format);
    expect(rasterOn.width).toBe(IMG_W);
    expect(rasterOn.height).toBe(IMG_H);
    expect(rasterOn.hash).not.toBe(rasterOff.hash);
    expect(stampAreaError(decodePng(rasterOff.buffer).data, 4, truth).mean).toBeGreaterThan(20);
    expect(stampAreaError(decodePng(rasterOn.buffer).data, 4, truth).mean).toBeLessThan(3);

    // The page render is rebuilt from the cleaned picture.
    expect(stampedOn.pageImage.hash).not.toBe(stampedOff.pageImage.hash);
    const centre = (png: Buffer): number => {
      const { data, width, height } = decodePng(png);
      // Stamp centre: a bar crosses the middle of the page.
      return data[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4];
    };
    expect(centre(stampedOff.pageImage.buffer)).toBeLessThan(200);
    expect(centre(stampedOn.pageImage.buffer)).toBeGreaterThan(240);

    expect(stampedOff.extractionDebug?.rasterWatermark).toBeUndefined();
    const debug = stampedOn.extractionDebug?.rasterWatermark;
    expect(debug?.pagesSampled).toBe(PAGE_COUNT);
    expect(debug?.cleanedImageStrengths).toHaveLength(1);
    expect(debug?.bbox[0]).toBeGreaterThan(0);

    // Unstamped page of the same document: byte-identical to removal off.
    expect(plainOn.pageImage.hash).toBe(plainOff.pageImage.hash);
    expect(plainOn.images.map((img) => img.hash)).toEqual(plainOff.images.map((img) => img.hash));
    expect(plainOn.extractionDebug?.rasterWatermark?.cleanedImageStrengths).toEqual([]);
  });

  it("leaves pictures with transparency untouched", async () => {
    const pdfBuffer = buildPdf({ softMask: true });
    const [off] = await extractPages({ pdfBuffer, groups: [[2]] });
    const [on] = await extractPages({ pdfBuffer, groups: [[2]], removeWatermarks: true });
    const rasterOff = off.images.find((img) => img.renderMethod === "raster");
    const rasterOn = on.images.find((img) => img.renderMethod === "raster");
    expect(rasterOff).toBeTruthy();
    // Same bytes, so the transparent strip is still transparent.
    expect(rasterOn?.hash).toBe(rasterOff?.hash);
    expect(on.extractionDebug?.rasterWatermark?.cleanedImageStrengths ?? []).toEqual([]);
  });

  it("keeps a JPEG picture a JPEG", async () => {
    const pdfBuffer = buildPdf({ jpeg: true });
    const [off] = await extractPages({ pdfBuffer, groups: [[2]] });
    const [on] = await extractPages({ pdfBuffer, groups: [[2]], removeWatermarks: true });
    const rasterOff = off.images.find((img) => img.renderMethod === "raster");
    const rasterOn = on.images.find((img) => img.renderMethod === "raster");
    expect(rasterOff?.format).toBe("jpeg");
    expect(rasterOn?.format).toBe("jpeg");
    expect(rasterOn?.hash).not.toBe(rasterOff?.hash);
    expect(rasterOn?.width).toBe(IMG_W);
    expect(rasterOn?.height).toBe(IMG_H);
  });
});
