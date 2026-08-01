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
 * Create a 1-page PDF with a raster image, overlapping vector, AND nearby text label.
 * The text "Figure 1" is placed just below the image+vector figure.
 * Used to verify text label absorption expands the figure group bbox.
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

  // Image at (100, 400) scaled to 200x200, overlapping red rect, plus text label below
  const stream = `
q
200 0 0 200 100 400 cm
/Im1 Do
Q
q
1 0 0 rg
120 420 50 50 re f
Q
BT
/F1 12 Tf
120 390 Td
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
