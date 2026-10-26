/**
 * Guards the reference-count workarounds in `mupdf-image-refs.ts`.
 *
 * Each helper must leave mupdf's reference counts exactly as it found them.
 * The "upstream" tests pin down the mupdf.js 1.27.0 leaks the helpers
 * compensate for. If an upgrade fixes those leaks, the upstream tests fail,
 * and the helpers must be changed before the version pin moves: against a
 * fixed mupdf.js they would release a reference twice.
 */
import { describe, it, expect, beforeEach } from "vitest"
import type { PDFDocument, PDFObject, PDFPage } from "mupdf"

// The getMask test reads an fz_image's refcount, which is the first int of
// the struct, straight from WASM memory. mupdf.js builds its Emscripten module
// from this global, so it must be set before mupdf loads. That is why mupdf
// and the module under test are imported dynamically below.
const wasmModule = {} as { HEAP32: Int32Array }
;(globalThis as Record<string, unknown>)["$libmupdf_wasm_Module"] = wasmModule
const { default: mupdf, emptyStore, shrinkStore } = await import("mupdf")
const { loadPdfImage, imageHasMask } = await import("../mupdf-image-refs.js")

const refcount = (pointer: number): number => wasmModule.HEAP32[pointer >> 2]

/** One page drawing a 4x4 RGB image with a gray /SMask, as /Im1. */
function createSoftMaskImagePdf(): Buffer {
  const doc = new mupdf.PDFDocument()
  const imageDict = (colorSpace: string) => {
    const dict = doc.newDictionary()
    dict.put("Type", doc.newName("XObject"))
    dict.put("Subtype", doc.newName("Image"))
    dict.put("Width", 4)
    dict.put("Height", 4)
    dict.put("BitsPerComponent", 8)
    dict.put("ColorSpace", doc.newName(colorSpace))
    return dict
  }
  const maskObj = doc.addStream(Buffer.alloc(16, 128), imageDict("DeviceGray"))
  const colorDict = imageDict("DeviceRGB")
  colorDict.put("SMask", maskObj)
  const imageObj = doc.addStream(Buffer.alloc(48, 200), colorDict)

  const xobjects = doc.newDictionary()
  xobjects.put("Im1", imageObj)
  const resources = doc.newDictionary()
  resources.put("XObject", xobjects)
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, "q 100 0 0 100 50 650 cm /Im1 Do Q"))
  return Buffer.from(doc.saveToBuffer("").asUint8Array())
}

function withImageRef(fn: (doc: PDFDocument, ref: PDFObject) => void): void {
  const doc = mupdf.Document.openDocument(createSoftMaskImagePdf(), "application/pdf") as PDFDocument
  const page = doc.loadPage(0) as PDFPage
  try {
    fn(doc, page.getObject().get("Resources").get("XObject").get("Im1"))
  } finally {
    page.destroy()
    doc.destroy()
  }
}

/** True when every item in mupdf's store can be evicted, i.e. no leaked
 *  reference pins one. Evicts everything evictable as a side effect. The
 *  typings say boolean, but the WASM call returns 0 or 1. */
const storeFullyEvictable = (): boolean => Boolean(shrinkStore(0))

describe("loadPdfImage", () => {
  beforeEach(() => emptyStore())

  it("upstream: doc.loadImage() + destroy() pins the image in the store", () => {
    withImageRef((doc, ref) => {
      const image = doc.loadImage(ref)
      image.toPixmap().destroy()
      image.destroy()
      expect(storeFullyEvictable()).toBe(false)
    })
  })

  it("leaves nothing pinned in the store after destroy()", () => {
    withImageRef((doc, ref) => {
      const image = loadPdfImage(doc, ref)
      expect(image.getWidth()).toBe(4)
      image.toPixmap().destroy()
      image.destroy()
      expect(storeFullyEvictable()).toBe(true)
    })
  })
})

describe("imageHasMask", () => {
  it("upstream: each getMask() + destroy() leaks one mask reference; imageHasMask leaks none", () => {
    withImageRef((doc, ref) => {
      const image = loadPdfImage(doc, ref)
      try {
        // The parent image holds the mask, so its memory stays valid to read.
        const first = image.getMask()!
        const maskPointer = first.pointer as unknown as number
        first.destroy()
        const afterFirst = refcount(maskPointer)

        image.getMask()!.destroy()
        expect(refcount(maskPointer)).toBe(afterFirst + 1)

        const leaked = refcount(maskPointer)
        expect(imageHasMask(image)).toBe(true)
        expect(refcount(maskPointer)).toBe(leaked)
      } finally {
        image.destroy()
      }
    })
  })

  it("returns false for an image without a mask", () => {
    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 2, 2], false)
    const image = new mupdf.Image(pixmap)
    expect(imageHasMask(image)).toBe(false)
    image.destroy()
    pixmap.destroy()
  })
})
