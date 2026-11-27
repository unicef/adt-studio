/** Experiment #744: a reproducible demo using the repository's real PDF fixture.
 * Run after pnpm typecheck: pnpm exec tsx scripts/seed-publisher-styles-demo.ts
 * Existing books are never overwritten. The demo's semantic grouping is curated
 * here (not AI output), so testing the design loop needs no provider credentials.
 */
import fs from "node:fs"
import path from "node:path"
import { extractPdf } from "../packages/pdf/dist/index.js"
import { createBookStorage } from "../packages/storage/dist/index.js"
import { createSectionIdFactory } from "../packages/pipeline/dist/index.js"
import type { ContentNodeData } from "../packages/types/dist/index.js"

const label = "styles-raven-demo"
const booksDir = path.resolve("books")
const bookDir = path.join(booksDir, label)
if (fs.existsSync(bookDir)) {
  console.log(`Demo already exists: ${label}`)
  process.exit(0)
}
const pdfPath = "tests/fixtures/raven.pdf"
const extracted = await extractPdf({ pdfBuffer: fs.readFileSync(pdfPath), endPage: 4 })
const storage = createBookStorage(label, booksDir)
try {
  fs.copyFileSync(pdfPath, path.join(bookDir, `${label}.pdf`))
  for (const page of extracted.pages) {
    storage.putExtractedPage(page)
    storage.putNodeData("positioned-text", page.pageId, page.positionedText)
    const paragraphs: ContentNodeData[] = []
    const merged = new Map<string, ContentNodeData>()
    for (const item of page.positionedText.drawItems) {
      if (item.kind !== "paragraph" || !item.text.trim()) continue
      const existing = item.mergedParagraphId ? merged.get(item.mergedParagraphId) : undefined
      if (existing) { existing.text += ` ${item.text}`; continue }
      const folio = /^\d+$/.test(item.text.trim()) && item.top > page.positionedText.pageHeight * 0.85
      const node: ContentNodeData = { nodeId: item.textId, role: folio ? "page_number" : "paragraph", text: item.text, isPruned: folio }
      if (page.pageNumber === 1 && paragraphs.length < 2) { node.role = "chapter_title"; node.headingLevel = 1 }
      paragraphs.push(node)
      if (item.mergedParagraphId) merged.set(item.mergedParagraphId, node)
    }
    // The fixture also contains page-wide composite/background layers. Select
    // its principal illustration for this curated demo; normal analysis uses
    // whatever image leaves the book's Sectioning step has accepted.
    const rasters = page.images.filter((image) => image.renderMethod === "raster")
    const image = [...(rasters.length ? rasters : page.images)].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const figure: ContentNodeData[] = image ? [{ nodeId: `${page.pageId}_demo_figure`, structure: "image_group", isPruned: false, children: [{ nodeId: image.imageId, role: "image", isPruned: false }] }] : []
    const nodes: ContentNodeData[] = page.pageNumber === 1
      ? [...paragraphs.filter((p) => p.headingLevel), ...figure, ...paragraphs.filter((p) => !p.headingLevel)]
      : [...figure, { nodeId: `${page.pageId}_demo_passage`, structure: "passage", isPruned: false, children: paragraphs }]
    storage.putNodeData("page-sectioning", page.pageId, { reasoning: "Curated demo grouping from the repository PDF fixture; no AI calls.", sections: [{
      sectionId: createSectionIdFactory(storage, page.pageId)(), sectionType: page.pageNumber === 1 ? "chapter" : "text",
      backgroundColor: "#FFFFFF", textColor: "#000000", pageNumber: page.pageNumber, isPruned: false, nodes,
    }] })
  }
  storage.putNodeData("metadata", "book", { title: "Hyena and Raven — Styles demo", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "Prototype demo from tests/fixtures/raven.pdf" })
  storage.markStepCompleted("extract")
  storage.markStepCompleted("metadata")
  storage.markStepCompleted("page-sectioning")
} finally { storage.close() }
console.log(`Created ${label} with ${extracted.pages.length} pages. Open Storyboard → Settings → Styles.`)
