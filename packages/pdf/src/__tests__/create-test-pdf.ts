/**
 * Helper to generate test PDFs with specific clipping/image scenarios.
 * Uses mupdf to create PDFs programmatically so tests don't depend on external files.
 */
import mupdf from "mupdf";

type PDFDoc = InstanceType<typeof mupdf.PDFDocument>;

/**
 * Create a test PDF with 3 pages:
 *
 * Page 1: Vector shapes with clip paths + overlapping shapes for grouping
 *   - Red rect clipped by clip_1
 *   - Blue rect clipped by clip_2
 *   - Two overlapping green rects (no clip, should be grouped)
 *   - Isolated orange rect (no clip, should be separate)
 *
 * Page 2: Nested clips (clip intersection)
 *   - Magenta full-page rect clipped by outer clip_1 AND inner clip_2 (nested)
 *   - Green rect clipped by single clip_3
 *
 * Page 3: Raster image with clip path
 *   - 20x20 red/blue test image at 200x200pt, clipped to 100x100 rect
 *   - Same image unclipped (for comparison)
 */
export function createTestPdf(): Buffer {
  const doc = new mupdf.PDFDocument();
  addVectorClipPage(doc);
  addNestedClipPage(doc);
  addRasterClipPage(doc);
  const buf = doc.saveToBuffer("").asUint8Array();
  return Buffer.from(buf);
}

function addVectorClipPage(doc: PDFDoc) {
  const stream = `
q
100 400 200 150 re W n
1 0 0 rg
50 350 300 250 re f
Q
q
350 400 100 100 re W n
0 0 1 rg
300 350 200 200 re f
Q
q
0 0.5 0 rg
100 100 80 80 re f
Q
q
0 0.5 0 rg
150 130 80 80 re f
Q
q
1 0.5 0 rg
500 100 50 50 re f
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  const resources = doc.addObject(doc.newDictionary());
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
}

function addNestedClipPage(doc: PDFDoc) {
  const stream = `
q
50 300 400 400 re W n
150 400 200 200 re W n
1 0 1 rg
0 0 612 792 re f
Q
q
100 100 100 80 re W n
0 1 0 rg
50 50 200 200 re f
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  const resources = doc.addObject(doc.newDictionary());
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
}

/**
 * Create a 1-page PDF with a tiny shape (10x10pt) and a normal shape (100x100pt)
 * placed far apart so they form separate groups. Used to test small-group filtering.
 */
export function createSmallGroupTestPdf(): Buffer {
  const doc = new mupdf.PDFDocument();
  // Tiny 10x10 green rect at (50, 50) and normal 100x100 red rect at (300, 300)
  const stream = `
q
0 0.5 0 rg
50 50 10 10 re f
Q
q
1 0 0 rg
300 300 100 100 re f
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  const resources = doc.addObject(doc.newDictionary());
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

/**
 * Create a 1-page PDF with a raster image AND overlapping vector shapes.
 * This simulates a "figure" composed of layered elements:
 *   - A 40x40 raster image placed at (100, 500) scaled to 200x200pt
 *   - A red vector rectangle overlapping the image at (120, 520) 50x50pt
 *   - An isolated blue vector rectangle far away at (450, 100) 60x60pt (should NOT be grouped)
 *
 * Expected: The raster image and overlapping red rect should be grouped into a single figure.
 * The isolated blue rect should remain a separate vector image.
 */
export function createFigureGroupTestPdf(): Buffer {
  const doc = new mupdf.PDFDocument();

  // Create a 40x40 test image: green/yellow pattern
  const imgW = 40;
  const imgH = 40;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  pixmap.clear(255);
  const samples = pixmap.getPixels();
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      samples[i] = x < imgW / 2 ? 0 : 255;       // R
      samples[i + 1] = 200;                         // G
      samples[i + 2] = y < imgH / 2 ? 0 : 100;    // B
    }
  }

  const image = new mupdf.Image(pixmap);
  const imgObj = doc.addImage(image);

  const xobjects = doc.newDictionary();
  xobjects.put("Im1", imgObj);
  const resourcesDict = doc.newDictionary();
  resourcesDict.put("XObject", xobjects);
  const resources = doc.addObject(resourcesDict);

  // Image at (100, 500) scaled to 200x200, plus overlapping red rect and isolated blue rect
  const stream = `
q
200 0 0 200 100 500 cm
/Im1 Do
Q
q
1 0 0 rg
120 520 50 50 re f
Q
q
0 0 1 rg
450 100 60 60 re f
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

/**
 * Create a 1-page PDF with a standalone raster image (no overlapping vectors).
 * Used to verify that raster-only pages are unaffected by figure grouping.
 */
export function createRasterOnlyTestPdf(): Buffer {
  const doc = new mupdf.PDFDocument();

  const imgW = 30;
  const imgH = 30;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  pixmap.clear(255);
  const samples = pixmap.getPixels();
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      samples[i] = 128; samples[i + 1] = 64; samples[i + 2] = 200;
    }
  }

  const image = new mupdf.Image(pixmap);
  const imgObj = doc.addImage(image);

  const xobjects = doc.newDictionary();
  xobjects.put("Im1", imgObj);
  const resourcesDict = doc.newDictionary();
  resourcesDict.put("XObject", xobjects);
  const resources = doc.addObject(resourcesDict);

  const stream = `
q
200 0 0 200 100 300 cm
/Im1 Do
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

/**
 * Create a 1-page PDF with a single raster image placed via a `cm` with a
 * negative scale on one axis, simulating a genuinely mirrored image as it
 * would appear in a real (possibly malformed) source PDF.
 *
 * The pixmap is asymmetric (left half red, right half blue for a horizontal
 * flip; top half red, bottom half blue for a vertical flip) so the mirror is
 * detectable by inspecting the *extracted* pixel buffer, not just its hash.
 * This exercises the full `extractPdf` pipeline end-to-end (stream parsing →
 * CTM-based flip detection → buffer flip), unlike unit tests that feed
 * hand-authored CTM arrays directly to internal functions.
 */
export function createMirroredRasterTestPdf(axis: "horizontal" | "vertical"): Buffer {
  const doc = new mupdf.PDFDocument();

  const imgW = 20;
  const imgH = 20;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  pixmap.clear(255);
  const samples = pixmap.getPixels();
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      const isFirstHalf = axis === "horizontal" ? x < imgW / 2 : y < imgH / 2;
      if (isFirstHalf) {
        samples[i] = 255; samples[i + 1] = 0; samples[i + 2] = 0; // red
      } else {
        samples[i] = 0; samples[i + 1] = 0; samples[i + 2] = 255; // blue
      }
    }
  }

  const image = new mupdf.Image(pixmap);
  const imgObj = doc.addImage(image);

  const xobjects = doc.newDictionary();
  xobjects.put("Im1", imgObj);
  const resourcesDict = doc.newDictionary();
  resourcesDict.put("XObject", xobjects);
  const resources = doc.addObject(resourcesDict);

  // Negative scale on the flipped axis mirrors the image via the CTM.
  const cm = axis === "horizontal" ? "-200 0 0 200 300 500" : "200 0 0 -200 300 500";
  const stream = `
q
${cm} cm
/Im1 Do
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

/**
 * Create a PDF whose rectangular raster is stored landscape but painted with
 * the same off-diagonal quarter-turn CTM used by InDesign in the real-world
 * certificate regression fixture.
 */
export function createQuarterTurnRasterTestPdf(): Buffer {
  const doc = new mupdf.PDFDocument();
  const imgW = 20;
  const imgH = 10;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  const samples = pixmap.getPixels();

  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      const left = x < imgW / 2;
      const top = y < imgH / 2;
      const rgb = top
        ? (left ? [255, 0, 0] : [0, 255, 0])
        : (left ? [0, 0, 255] : [255, 255, 0]);
      samples[i] = rgb[0];
      samples[i + 1] = rgb[1];
      samples[i + 2] = rgb[2];
    }
  }

  const image = new mupdf.Image(pixmap);
  const imgObj = doc.addImage(image);
  const xobjects = doc.newDictionary();
  xobjects.put("Im1", imgObj);
  const resourcesDict = doc.newDictionary();
  resourcesDict.put("XObject", xobjects);
  const resources = doc.addObject(resourcesDict);

  const stream = `
q
0 -200 100 0 100 300 cm
/Im1 Do
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

/**
 * Create a 1-page PDF with a raster image, overlapping vector, AND a text
 * label attached by a leader line. Used to verify raster-aware grouping keeps
 * intrinsic annotations while ordinary captions can remain semantic text.
 */
export function createFigureWithTextPdf(): Buffer {
  const doc = new mupdf.PDFDocument();

  // Create a 30x30 test image
  const imgW = 30;
  const imgH = 30;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  pixmap.clear(255);
  const samples = pixmap.getPixels();
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      samples[i] = 100; samples[i + 1] = 150; samples[i + 2] = 200;
    }
  }

  const image = new mupdf.Image(pixmap);
  const imgObj = doc.addImage(image);

  // Create a font for text
  const font = new mupdf.Font("Helvetica");
  const fontObj = doc.addSimpleFont(font);

  const xobjects = doc.newDictionary();
  xobjects.put("Im1", imgObj);
  const fontDict = doc.newDictionary();
  fontDict.put("F1", fontObj);
  const resourcesDict = doc.newDictionary();
  resourcesDict.put("XObject", xobjects);
  resourcesDict.put("Font", fontDict);
  const resources = doc.addObject(resourcesDict);

  // Image at (100, 400) scaled to 200x200, overlapping red rect, plus a
  // leader line and label on the right.
  const stream = `
q
200 0 0 200 100 400 cm
/Im1 Do
Q
q
1 0 0 rg
120 420 50 50 re f
Q
q
0 0 0 RG
1 w
280 510 m
315 510 l
S
Q
BT
/F1 12 Tf
320 505 Td
(Figure 1) Tj
ET
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  return Buffer.from(doc.saveToBuffer("").asUint8Array());
}

function addRasterClipPage(doc: PDFDoc) {
  // Create a 20x20 test image: red left half, blue right half
  const imgW = 20;
  const imgH = 20;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  pixmap.clear(255);
  const samples = pixmap.getPixels();
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      if (x < imgW / 2) {
        samples[i] = 255; samples[i + 1] = 0; samples[i + 2] = 0;
      } else {
        samples[i] = 0; samples[i + 1] = 0; samples[i + 2] = 255;
      }
    }
  }

  const image = new mupdf.Image(pixmap);
  const imgObj = doc.addImage(image);

  const xobjects = doc.newDictionary();
  xobjects.put("Im1", imgObj);
  const resourcesDict = doc.newDictionary();
  resourcesDict.put("XObject", xobjects);
  const resources = doc.addObject(resourcesDict);

  // Image at (100, 400) scaled to 200x200, clipped to 100x100 rect at (150, 450)
  const stream = `
q
150 450 100 100 re W n
200 0 0 200 100 400 cm
/Im1 Do
Q
q
200 0 0 200 350 400 cm
/Im1 Do
Q
`;
  const buf = new mupdf.Buffer();
  buf.writeLine(stream);
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
}

/**
 * Create a multi-page PDF that mimics a publisher-watermarked book:
 *
 * - Every page carries the identical diagonal red stamp "FOR TESTING ONLY"
 *   (rotated 45°, drawn across the page center) — a watermark.
 * - Every page carries the identical small horizontal line "Running Head"
 *   at the top — repeated page furniture that must NOT be detected.
 * - Every page has one unique body text line ("Content of page N").
 * - Every page paints a green→blue axial gradient (a `sh` shading op), so
 *   the watermark-filtered render exercises fillShade forwarding.
 * - Page 2 additionally has a raster image with an overlapping vector, so
 *   figure grouping produces a page-crop composite on a watermarked page.
 */
export function createWatermarkedTestPdf(pageCount: number = 4): Buffer {
  const doc = new mupdf.PDFDocument();

  // Axial (type 2) shading: green at the left edge to blue at the right.
  const shadingFn = doc.newDictionary();
  shadingFn.put("FunctionType", 2);
  shadingFn.put("Domain", [0, 1]);
  shadingFn.put("C0", [0, 0.6, 0.2]);
  shadingFn.put("C1", [0, 0.2, 0.8]);
  shadingFn.put("N", 1);
  const shading = doc.newDictionary();
  shading.put("ShadingType", 2);
  shading.put("ColorSpace", "DeviceRGB");
  shading.put("Coords", [400, 560, 500, 560]);
  shading.put("Function", doc.addObject(shadingFn));
  shading.put("Extend", [true, true]);
  const shadingObj = doc.addObject(shading);

  const imgW = 30;
  const imgH = 30;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, imgW, imgH], false);
  pixmap.clear(255);
  const samples = pixmap.getPixels();
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 3;
      samples[i] = 40; samples[i + 1] = 90; samples[i + 2] = 40;
    }
  }
  const image = new mupdf.Image(pixmap);

  const font = new mupdf.Font("Helvetica");

  const numberWords = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
  for (let p = 0; p < pageCount; p++) {
    const imgObj = doc.addImage(image);
    const fontObj = doc.addSimpleFont(font);
    const xobjects = doc.newDictionary();
    xobjects.put("Im1", imgObj);
    const fontDict = doc.newDictionary();
    fontDict.put("F1", fontObj);
    const shadingDict = doc.newDictionary();
    shadingDict.put("Sh1", shadingObj);
    const resourcesDict = doc.newDictionary();
    resourcesDict.put("XObject", xobjects);
    resourcesDict.put("Font", fontDict);
    resourcesDict.put("Shading", shadingDict);
    const resources = doc.addObject(resourcesDict);

    const figure = p === 1
      ? `
q
200 0 0 200 100 150 cm
/Im1 Do
Q
q
0 0 1 rg
120 170 50 50 re f
Q
`
      : "";
    // cos45 = sin45 ≈ 0.707; the stamp runs diagonally from lower-left.
    const stream = `
BT
/F1 12 Tf
1 0 0 1 72 750 Tm
(Running Head) Tj
ET
BT
/F1 14 Tf
1 0 0 1 72 700 Tm
(Content of page ${numberWords[p] ?? String(p + 1)}) Tj
ET
${figure}
q
400 560 100 100 re W n
/Sh1 sh
Q
q
1 0 0 rg
BT
/F1 48 Tf
0.707 0.707 -0.707 0.707 120 120 Tm
(FOR TESTING ONLY) Tj
ET
Q
`;
    const buf = new mupdf.Buffer();
    buf.writeLine(stream);
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf));
  }

  const out = doc.saveToBuffer("").asUint8Array();
  return Buffer.from(out);
}
