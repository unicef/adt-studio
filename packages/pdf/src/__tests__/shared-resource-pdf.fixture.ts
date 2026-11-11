import mupdf from "mupdf"

const PAGE_W = 612
const PAGE_H = 792
const IMG = 64

/**
 * Build an N-page PDF where all pages reference ONE shared resources object
 * listing N distinct, identically-sized images (`I0`..`I{N-1}`). Page i draws
 * `/I{i}` full-page. Each image is filled with a distinct per-layer pattern so
 * the layers have different pixels (and therefore different content digests).
 */
export function createSharedResourceLayerPdf(n: number): Buffer {
  const doc = new mupdf.PDFDocument()

  const xobjects = doc.newDictionary()
  for (let layer = 0; layer < n; layer++) {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, IMG, IMG], false)
    pixmap.clear(255)
    const samples = pixmap.getPixels()
    // A per-layer gradient keyed on the layer index — distinct pixels per layer.
    for (let y = 0; y < IMG; y++) {
      for (let x = 0; x < IMG; x++) {
        const i = (y * IMG + x) * 3
        samples[i] = (x * 4 + layer * 40) % 256 // R
        samples[i + 1] = (y * 4 + layer * 25) % 256 // G
        samples[i + 2] = (layer * 60) % 256 // B
      }
    }
    xobjects.put(`I${layer}`, doc.addImage(new mupdf.Image(pixmap)))
  }

  // ONE shared resources object, handed to every page below.
  const resourcesDict = doc.newDictionary()
  resourcesDict.put("XObject", xobjects)
  const resources = doc.addObject(resourcesDict)

  for (let page = 0; page < n; page++) {
    const stream = `q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/I${page} Do\nQ\n`
    const buf = new mupdf.Buffer()
    buf.writeLine(stream)
    doc.insertPage(-1, doc.addPage([0, 0, PAGE_W, PAGE_H], 0, resources, buf))
  }

  return Buffer.from(doc.saveToBuffer("").asUint8Array())
}

