/**
 * Palette (Indexed) images whose base colour space is shared with the page (#1137).
 *
 * Foxit PhantomPDF Printer 9.7 writes page tiles as palette images with an
 * inline colour space, `[/Indexed 1162 0 R 255 25 0 R]`, and opens every page
 * with `/CS1 cs`, where CS1 is that same `1162 0 R`. mupdf 1.27 cached the
 * inline Indexed space under its base's object number, so the plain 3-channel
 * base loaded by `/CS1 cs` was handed to the image. mupdf then read the
 * 1-byte-per-pixel data as RGB, filled about a third of the tile and padded
 * the rest with black. Fixed upstream in mupdf 1.28.0 (Artifex bug 709424).
 * These tests fail if the pin moves back to an affected version.
 */
import { describe, it, expect } from "vitest"
import mupdf from "mupdf"
import { extractPdf } from "../extract.js"
import { decodePng } from "../png-utils.js"

const PAGE_SIZE = 100
const IMAGE_SIZE = 8

/**
 * One 100×100 pt page filled by an 8×8 palette image in which every pixel is
 * index 1 (red). The image's colour space is the inline array
 * `[/Indexed <base> 1 <lookup>]`, and `<base>` is also the page's /CS1,
 * selected by `/CS1 cs` before the image is drawn.
 */
function createSharedBasePaletteImagePdf(): Buffer {
  const doc = new mupdf.PDFDocument()

  // A calibrated RGB base: an indirect array, cached by mupdf like an ICCBased one.
  const calParams = doc.newDictionary()
  const whitePoint = doc.newArray()
  for (const v of [0.9505, 1, 1.089]) whitePoint.push(v)
  calParams.put("WhitePoint", whitePoint)
  const baseArray = doc.newArray()
  baseArray.push(doc.newName("CalRGB"))
  baseArray.push(calParams)
  const base = doc.addObject(baseArray)

  // Two palette entries: 0 = black, 1 = red.
  const lookup = doc.addStream(Buffer.from([0, 0, 0, 255, 0, 0]), doc.newDictionary())
  const indexed = doc.newArray()
  indexed.push(doc.newName("Indexed"))
  indexed.push(base)
  indexed.push(1)
  indexed.push(lookup)

  const imageDict = doc.newDictionary()
  imageDict.put("Type", doc.newName("XObject"))
  imageDict.put("Subtype", doc.newName("Image"))
  imageDict.put("Width", IMAGE_SIZE)
  imageDict.put("Height", IMAGE_SIZE)
  imageDict.put("BitsPerComponent", 8)
  imageDict.put("ColorSpace", indexed)
  const image = doc.addStream(Buffer.alloc(IMAGE_SIZE * IMAGE_SIZE, 1), imageDict)

  const colorSpaces = doc.newDictionary()
  colorSpaces.put("CS1", base)
  const xobjects = doc.newDictionary()
  xobjects.put("Im1", image)
  const resources = doc.newDictionary()
  resources.put("ColorSpace", colorSpaces)
  resources.put("XObject", xobjects)

  const content = `/CS1 cs /CS1 CS q ${PAGE_SIZE} 0 0 ${PAGE_SIZE} 0 0 cm /Im1 Do Q`
  doc.insertPage(-1, doc.addPage([0, 0, PAGE_SIZE, PAGE_SIZE], 0, resources, content))
  return Buffer.from(doc.saveToBuffer("").asUint8Array())
}

/**
 * Share of pixels that are not red. The CalRGB → sRGB conversion turns the
 * palette's red into about (255, 0, 72), so blue is not checked. The bug
 * renders (near) black.
 */
function nonRedShare(png: Buffer): number {
  const { data, width, height } = decodePng(png)
  const channels = data.length / (width * height)
  let off = 0
  for (let i = 0; i < data.length; i += channels) {
    if (data[i] < 200 || data[i + 1] > 60) off++
  }
  return off / (width * height)
}

describe("extractPdf palette images sharing the page's base colour space (#1137)", () => {
  it("renders the page image in the palette colours, not black", async () => {
    const result = await extractPdf({ pdfBuffer: createSharedBasePaletteImagePdf() })
    expect(nonRedShare(result.pages[0].pageImage.buffer)).toBe(0)
  })

  it("extracts the palette image itself in its own colours", async () => {
    const result = await extractPdf({ pdfBuffer: createSharedBasePaletteImagePdf() })
    const { images } = result.pages[0]
    expect(images).toHaveLength(1)
    expect(images[0].format).toBe("png")
    expect(nonRedShare(images[0].buffer)).toBe(0)
  })
})
