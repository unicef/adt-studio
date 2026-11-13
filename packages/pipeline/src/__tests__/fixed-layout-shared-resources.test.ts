import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { extractPdf } from "@adt/pdf"
import { createBookStorage } from "@adt/storage"
import { createSharedResourceLayerPdf } from "../../../pdf/src/__tests__/shared-resource-pdf.fixture.js"
import { processFixedLayoutPages } from "../fixed-layout-rendering.js"

let root: string
let storage: ReturnType<typeof createBookStorage>
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "fixed-shared-resource-"))
  storage = createBookStorage("book", root)
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

async function extracted(count: number) {
  const result = await extractPdf({ pdfBuffer: createSharedResourceLayerPdf(count), fixedLayout: true })
  for (const page of result.pages) {
    storage.putExtractedPage(page)
    storage.putNodeData("positioned-text", page.pageId, page.positionedText)
    storage.putNodeData("image-filtering", page.pageId, { images: storage.getPageImages(page.pageId).map(image => ({ imageId: image.imageId, isPruned: image.imageId === `${page.pageId}_page` })) })
  }
  return result.pages
}

it.each([1, 4])("renders each actual draw from a %i-page shared-resource PDF and tolerates derived assets", async count => {
  const pages = await extracted(count)
  const first = pages[0], source = first.images[0]
  storage.putCroppedImage({ imageId: source.imageId, pageId: first.pageId, version: 1, buffer: source.buffer, width: source.width, height: source.height })
  storage.putSegmentedImage({ sourceImageId: source.imageId, pageId: first.pageId, segmentIndex: 1, version: 1, buffer: source.buffer, width: source.width, height: source.height, bounds: { x: 1, y: 1, width: 10, height: 10 } })
  storage.putNodeData("image-filtering", first.pageId, { images: storage.getPageImages(first.pageId).map(image => ({ imageId: image.imageId, isPruned: image.imageId === `${first.pageId}_page` })) })
  const unavailable: string[] = []
  await processFixedLayoutPages(storage, "/images", undefined, { onUnavailable: id => { unavailable.push(id) } })
  expect(unavailable).toEqual([])
  const renderedIds: string[] = []
  for (const page of pages) {
    const drawn = page.positionedText.drawItems.filter(item => item.kind === "image")
    expect(drawn).toHaveLength(1)
    expect(page.images.filter(image => image.bounds)).toHaveLength(1)
    const data = storage.getLatestNodeData("web-rendering", page.pageId)?.data as { sections: Array<{ html: string }> }
    expect(data.sections).toHaveLength(1)
    const html = data.sections[0].html
    expect(html).toContain(`data-id="${drawn[0].imageId}"`)
    expect(html.match(/<img\b/g)).toHaveLength(1)
    expect(html).not.toMatch(/_crop_|_seg/)
    renderedIds.push(drawn[0].imageId)
  }
  expect(new Set(renderedIds.map(id => id.match(/_im\d+/)?.[0])).size).toBe(count)
}, 20000)

it.each(["missing classification", "missing drawn file", "missing position", "duplicate classification", "invalid viewport"])(
  "retains output with %s", async damage => {
    const [page] = await extracted(1)
    await processFixedLayoutPages(storage, "/images")
    const oldHtml = storage.getAllNodeVersions("web-rendering", page.pageId)
    const oldTree = storage.getAllNodeVersions("fixed-layout-sectioning", page.pageId)
    const drawn = page.positionedText.drawItems.find(item => item.kind === "image")!
    if (damage === "missing classification") storage.putNodeData("image-filtering", page.pageId, { images: [] })
    if (damage === "duplicate classification") storage.putNodeData("image-filtering", page.pageId, { images: [drawn, drawn].map(image => ({ imageId: image.imageId, isPruned: false })) })
    if (damage === "missing drawn file") fs.unlinkSync(path.join(root, "book", storage.getImageMeta(drawn.imageId)!.relativePath))
    if (damage === "missing position") storage.putNodeData("positioned-text", page.pageId, { ...page.positionedText, drawItems: [] })
    if (damage === "invalid viewport") storage.putNodeData("positioned-text", page.pageId, { ...page.positionedText, pageWidth: 0 })
    const unavailable: string[] = []
    await processFixedLayoutPages(storage, "/images", undefined, { onUnavailable: id => { unavailable.push(id) } })
    expect(unavailable).toEqual([page.pageId])
    expect(storage.getAllNodeVersions("web-rendering", page.pageId)).toEqual(oldHtml)
    expect(storage.getAllNodeVersions("fixed-layout-sectioning", page.pageId)).toEqual(oldTree)
  }, 20000,
)
