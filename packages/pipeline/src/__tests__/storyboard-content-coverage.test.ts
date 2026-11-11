import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { PageSectioningOutput } from "@adt/types"
import { inputSignature } from "../output-freshness.js"
import { sourceGenerationBasis } from "../source-generation-state.js"
import { renderPage } from "../web-rendering.js"
import { storyboardCoverage } from "../storyboard-coverage.js"
import { processFixedLayoutPages } from "../fixed-layout-rendering.js"
import { captureStoryboardSource, publishStoryboardSource, storyboardSourceWarnings } from "../storyboard-source-state.js"

let root: string, storage: ReturnType<typeof createBookStorage>
const tree = () => PageSectioningOutput.parse({ reasoning: "", sections: [{ sectionId: "p1_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "p1_t1", role: "text", text: "Original", isPruned: false }] }] })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-coverage-"))
  storage = createBookStorage("book", root)
  storage.putExtractedPage({ pageId: "p1", pageNumber: 1, text: "Original", pageImage: { imageId: "p1_page", buffer: Buffer.from("page"), hash: "page", width: 100, height: 100, format: "png" }, images: [] })
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it.each(["pruned leaf", "pruned ancestor", "empty container"])("completes the actual renderer's empty semantic output (%s)", async kind => {
  const source = tree()
  const leaf = source.sections[0].nodes[0]
  source.sections[0].nodes = kind === "pruned leaf" ? [{ ...leaf, isPruned: true }] : [{ nodeId: "group", structure: "paragraph", isPruned: kind === "pruned ancestor", children: kind === "empty container" ? [] : [leaf] }]
  storage.putNodeData("page-sectioning", "p1", source)
  const generateObject = vi.fn(async () => { throw new Error("Empty content must not generate") })
  const output = await renderPage({ label: "book", pageId: "p1", pageImageBase64: "", sectioning: source, images: new Map() }, () => { throw new Error("No render strategy needed") }, { generateObject })
  storage.putNodeData("web-rendering", "p1", output)
  expect(output.sections).toEqual([])
  expect(generateObject).not.toHaveBeenCalled()
  expect(storyboardCoverage(storage)).toMatchObject({ complete: true, included: 0, rendered: 0 })
})

it("does not call an unpruned missing image or blank fixed canvas empty", async () => {
  const source = tree(); source.sections[0].nodes = [{ nodeId: "missing", role: "image", isPruned: false }]
  storage.putNodeData("page-sectioning", "p1", source)
  storage.putNodeData("web-rendering", "p1", { sections: [] })
  expect(storyboardCoverage(storage)).toMatchObject({ complete: false, included: 1 })
  storage.putNodeData("fixed-layout-sectioning", "p1", { ...source, sections: [{ ...source.sections[0], sectionType: "fixed-layout-page", nodes: [], viewport: { width: 100, height: 100 }, placement: {} }] })
  expect(storyboardCoverage(storage)).toMatchObject({ complete: false, included: 1 })
})

it.each([false, true])("keeps fixed source current across derived media and detects positioned/source changes (legacy proof=%s)", async legacy => {
  const sourceImage = { imageId: "p1_im001", buffer: Buffer.from("source"), hash: "source", format: "png", width: 20, height: 20, bounds: { x: 0, y: 0, width: 20, height: 20 } }
  storage.putExtractedPage({ pageId: "p1", pageNumber: 1, text: "Original", pageImage: { imageId: "p1_page", buffer: Buffer.from("page"), hash: "page", width: 100, height: 100, format: "png" }, images: [sourceImage] })
  const positioned = { pageWidth: 100, pageHeight: 100, renderWidth: 100, renderHeight: 100, drawItems: [{ kind: "image", imageId: "p1_im001", bounds: sourceImage.bounds }] }
  storage.putNodeData("positioned-text", "p1", positioned)
  storage.putNodeData("image-filtering", "p1", { images: [{ imageId: "p1_im001", isPruned: false }] })
  await processFixedLayoutPages(storage, "/images")
  publishStoryboardSource(storage, "p1", captureStoryboardSource(storage, "p1"))
  if (legacy) {
    const version = storage.getLatestNodeData("web-rendering", "p1")!.version
    const sectionId = (storage.getLatestNodeData("fixed-layout-sectioning", "p1")!.data as PageSectioningOutput).sections[0].sectionId
    storage.putNodeData("source-generation-state", JSON.stringify(["web-rendering", "p1", version]), { version: 1, sections: [{ sectionId, layout: "fixed", signature: inputSignature({ tree: sourceGenerationBasis("fixed-layout-sectioning", storage.getLatestNodeData("fixed-layout-sectioning", "p1")!.data), positioned, images: storage.getPageImages("p1"), filtering: storage.getLatestNodeData("image-filtering", "p1")!.data }) }] })
  }
  expect(storyboardSourceWarnings(storage)).toEqual([])
  storage.putTranslatedImage({ sourceImageId: "p1_im001", pageId: "p1", languageCode: "fr", buffer: Buffer.from("translated"), width: 20, height: 20 })
  storage.putCroppedImage({ imageId: "p1_im001", pageId: "p1", version: 1, buffer: Buffer.from("cropped"), width: 10, height: 10 })
  expect(storyboardSourceWarnings(storage)).toEqual([])
  storage.putNodeData("positioned-text", "p1", { ...positioned, drawItems: [{ ...positioned.drawItems[0], bounds: { ...sourceImage.bounds, x: 5 } }] })
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
  storage.putNodeData("positioned-text", "p1", positioned)
  expect(storyboardSourceWarnings(storage)).toEqual([])
  storage.putExtractedPage({ pageId: "p1", pageNumber: 1, text: "Original", pageImage: { imageId: "p1_page", buffer: Buffer.from("page"), hash: "page", width: 100, height: 100, format: "png" }, images: [{ ...sourceImage, buffer: Buffer.from("changed source"), hash: "changed-source", width: legacy ? 21 : 20 }] })
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
})


it("retains usable owned legacy HTML for an empty source tree without requiring output for a truly empty section", () => {
  const source = tree(); source.sections[0].nodes = []
  storage.putNodeData("page-sectioning", "p1", source)
  expect(storyboardCoverage(storage)).toMatchObject({ complete: true, included: 0, rendered: 0 })
  storage.putNodeData("web-rendering", "p1", { sections: [{ sectionId: "p1_sec001", sectionIndex: 0, sectionType: "text", reasoning: "retained", html: "<main>Retained manual content</main>" }] })
  expect(storyboardCoverage(storage)).toMatchObject({ complete: true, included: 1, rendered: 1 })
  source.sections[0].isPruned = true
  storage.putNodeData("page-sectioning", "p1", source)
  expect(storyboardCoverage(storage)).toMatchObject({ complete: true, included: 0, rendered: 0 })
})
