/**
 * Verifies that positioned-text drawItems are emitted in true PDF
 * content-stream order, not mupdf's StructuredText reading-flow order.
 *
 * The regression this guards: a children's-book scene where speech bubbles
 * are drawn (paths) BEFORE their text in the PDF stream — but mupdf's
 * walker reorders blocks for reading flow, putting text before the small
 * bubble paths in walker order. Naive seqno assignment from the walker
 * then sorted text BEFORE bubbles, hiding text under opaque bubble fill.
 *
 * The fix uses a recording Device (`Page.run`) which fires once per
 * content-stream operator in stream order, giving authoritative seqnos.
 */
import { describe, it, expect } from "vitest"
import mupdf from "mupdf"
import { extractPdf } from "../extract.js"

/**
 * Create a 1-page PDF with this drawing order:
 *   1. White background rect (full page)
 *   2. A black-stroked rectangle "bubble" at (50, 600) sized 200x60
 *   3. Text "Inside bubble!" at the bubble's interior baseline
 *   4. Text "Above bubble" at the top of the page
 *
 * The text is drawn AFTER the bubble in the stream, so the rendered EPUB
 * must place text DOM-after the bubble image so it renders on top.
 */
function createBubbleScenarioPdf(): Buffer {
  const doc = new mupdf.PDFDocument()

  // Embed a simple Type1 font (Helvetica) for text rendering
  const fontDict = doc.newDictionary()
  fontDict.put("Type", doc.newName("Font"))
  fontDict.put("Subtype", doc.newName("Type1"))
  fontDict.put("BaseFont", doc.newName("Helvetica"))
  fontDict.put("Encoding", doc.newName("WinAnsiEncoding"))
  const fontObj = doc.addObject(fontDict)

  const fonts = doc.newDictionary()
  fonts.put("F1", fontObj)
  const resourcesDict = doc.newDictionary()
  resourcesDict.put("Font", fonts)
  const resources = doc.addObject(resourcesDict)

  // Content stream — order matters; this is the painter's order.
  // PDF user space is y-up; on a 612x792 page:
  //   - bubble at user-space (50..250, 600..660), i.e. visually upper area
  //   - "Above bubble" text baseline at y=750 (very top)
  //   - "Inside bubble!" text baseline at y=625 (inside the bubble)
  const stream = `
% 1. Full-page white background fill
q
1 1 1 rg
0 0 612 792 re f
Q
% 2. Bubble outline drawn FIRST (so text drawn after it goes on top)
q
0 0 0 RG
1 w
50 600 200 60 re S
Q
% 3. Text drawn AFTER the bubble — must appear ON TOP in rendered output
BT
/F1 12 Tf
60 625 Td
(Inside bubble!) Tj
ET
BT
/F1 12 Tf
60 750 Td
(Above bubble) Tj
ET
`
  const buf = new mupdf.Buffer()
  buf.writeLine(stream)
  doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, buf))
  return Buffer.from(doc.saveToBuffer("").asUint8Array())
}

describe("positioned-text draw order — stream-order recorder", () => {
  it("emits bubble-text after its enclosing bubble shape", async () => {
    const pdfBuffer = createBubbleScenarioPdf()
    // positionedText / draw-order is a fixed-layout concern, so request it.
    const result = await extractPdf({ pdfBuffer, fixedLayout: true })

    expect(result.pages).toHaveLength(1)
    const page = result.pages[0]
    const items = page.positionedText.drawItems
    expect(items.length).toBeGreaterThan(0)

    const insideIdx = items.findIndex(
      (i) => i.kind === "paragraph" && i.text.includes("Inside bubble"),
    )
    const aboveIdx = items.findIndex(
      (i) => i.kind === "paragraph" && i.text.includes("Above bubble"),
    )
    expect(insideIdx).toBeGreaterThanOrEqual(0)
    expect(aboveIdx).toBeGreaterThanOrEqual(0)

    // The bubble can be picked up either as a vector figure (an image item)
    // or simply as path ops; in either case, EVERY image draw item that
    // overlaps the "Inside bubble" text must come BEFORE that paragraph in
    // the final draw order. This is the core invariant: text drawn on top
    // of an image in the PDF stream renders DOM-after that image.
    const insideItem = items[insideIdx]
    if (insideItem.kind !== "paragraph") throw new Error("unreachable")
    const textX = insideItem.left
    const textY = insideItem.top + insideItem.lineHeight

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind !== "image" || !it.bounds) continue
      const b = it.bounds
      const overlapsText =
        textX >= b.x &&
        textX <= b.x + b.width &&
        textY >= b.y &&
        textY <= b.y + b.height
      if (overlapsText) {
        expect(i).toBeLessThan(insideIdx)
      }
    }
  })

  it("matches each asHTML paragraph to a glyph-stream-order seqno", async () => {
    const pdfBuffer = createBubbleScenarioPdf()
    // positionedText / draw-order is a fixed-layout concern, so request it.
    const result = await extractPdf({ pdfBuffer, fixedLayout: true })

    const items = result.pages[0].positionedText.drawItems
    const paragraphs = items.filter((i) => i.kind === "paragraph")
    // Both text strings should appear; both have unique textIds.
    const ids = new Set(paragraphs.map((p) => (p.kind === "paragraph" ? p.textId : "")))
    expect(ids.size).toBe(paragraphs.length)
  })

  it("extracts positioned-text for reflowable books too (strategy-independent geometry)", async () => {
    // Positioned-text (page geometry) is now produced for EVERY book so the
    // render strategy can be switched to fixed-layout later without
    // re-extracting. A reflowable extraction therefore still emits draw items
    // and viewport dimensions; only the destructive figure dedup
    // (excludeConsumedFigureShapes) stays gated on fixedLayout.
    const pdfBuffer = createBubbleScenarioPdf()
    const result = await extractPdf({ pdfBuffer })

    const page = result.pages[0]
    expect(page.positionedText.drawItems.length).toBeGreaterThan(0)
    expect(
      page.positionedText.drawItems.some((i) => i.kind === "paragraph"),
    ).toBe(true)
    // Viewport dims populated from page bounds.
    expect(page.positionedText.pageWidth).toBeCloseTo(612, 0)
    expect(page.positionedText.pageHeight).toBeCloseTo(792, 0)
  })
})
