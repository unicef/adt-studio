// Real-storage regressions for Claude's S1/S2 source-review counterexamples.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { processFixedLayoutPages } from "../fixed-layout-rendering.js"
import { collectPageTexts } from "../glossary.js"
import { collectQuizPages, collectQuizPageTexts } from "../quiz-generation.js"
import { protectedAuthoredRecords, resetSectioningStoryboard } from "../authored-output.js"

let root: string, storage: ReturnType<typeof createBookStorage>
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "reset-readers-"))
  storage = createBookStorage("book", root)
  for (const n of [2, 7, 9]) {
    const id = `p${n}`
    storage.putExtractedPage({ pageId: id, pageNumber: n, text: `page ${n}`, images: [], pageImage: { imageId: id + "_page", buffer: Buffer.from("retained pixels"), hash: "test", format: "png", width: 600, height: 800 } })
    storage.putNodeData("page-sectioning", id, { source: "manual", reasoning: "fixture", sections: [{ sectionId: id + "_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: n, isPruned: false, nodes: [{ nodeId: id + "_text", role: "text", text: `page ${n}`, isPruned: false }] }] })
    storage.putNodeData("web-rendering", id, { sections: [{ sectionIndex: 0, sectionId: id + "_sec001", sectionType: "text", reasoning: "retained", html: `<section data-section-id="${id}_sec001"><p data-id="${id}_text">page ${n}</p></section>` }] })
    storage.putNodeData("positioned-text", id, { pageWidth: 600, pageHeight: 800, renderWidth: 600, renderHeight: 800, drawItems: n === 7 ? [{ kind: "paragraph", textId: id + "_text", text: "page 7", segments: [{ text: "page 7" }], top: 10, left: 10, lineHeight: 20 }] : [] })
    storage.putNodeData("image-filtering", id, { images: n === 2 ? [{ imageId: "p2_im001", isPruned: false }] : [] })
  }
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("direct reset refuses an unreadable selected tree but retains access beside an unselected unreadable neighbor", () => {
  const valid = storage.getLatestNodeData("page-sectioning", "p2")!.data
  storage.putNodeData("page-sectioning", "p2", { sections: "invalid" })
  const reset = () => resetSectioningStoryboard(storage, { fromStage: "sectioning", toStage: "sectioning", replaceManual: true,
    protectedReplacements: protectedAuthoredRecords(storage, "receipt").filter(record => record.itemId === "p2") }, "receipt")
  const before = storage.getAllNodeVersions("web-rendering", "p2")
  expect(reset).toThrow("SECTIONING_INPUT_UNREADABLE: p2; total=1")
  expect(storage.getAllNodeVersions("web-rendering", "p2")).toEqual(before)
  storage.putNodeData("page-sectioning", "p2", valid)
  storage.putNodeData("page-sectioning", "p7", { sections: "invalid" })
  const neighbor = storage.getAllNodeVersions("web-rendering", "p7")
  reset()
  expect(storage.getLatestNodeData("web-rendering", "p2")?.data).toBeNull()
  expect(storage.getAllNodeVersions("web-rendering", "p7")).toEqual(neighbor)
})

it("does not overwrite an image-bearing page with blank positioned output; runnable and truly blank pages still publish", async () => {
  const before = storage.getAllNodeVersions("web-rendering", "p2")
  const unavailable: string[] = [], published: string[] = []
  await processFixedLayoutPages(storage, "/images", undefined, { onUnavailable: id => { unavailable.push(id) }, onPage: id => { published.push(id) } })
  expect(unavailable).toEqual(["p2"])
  expect(published).toEqual(["p7", "p9"])
  expect(storage.getAllNodeVersions("web-rendering", "p2")).toEqual(before)
  expect(storage.getLatestNodeData("fixed-layout-sectioning", "p2")).toBeNull()
  expect(storage.getAllNodeVersions("web-rendering", "p7")).toHaveLength(2)
  expect(storage.getAllNodeVersions("web-rendering", "p9")).toHaveLength(2)
})

it("reset pages are absent input to Glossary and Quizzes while other saved pages remain usable", () => {
  const before = storage.getAllNodeVersions("web-rendering", "p2")
  const neighbor = storage.getAllNodeVersions("web-rendering", "p7")
  resetSectioningStoryboard(storage, { fromStage: "sectioning", toStage: "sectioning", replaceManual: true, protectedReplacements: protectedAuthoredRecords(storage, "receipt").filter(record => record.itemId === "p2") }, "receipt")
  expect(storage.getLatestNodeData("web-rendering", "p2")?.data).toBeNull()
  expect(collectPageTexts(storage, storage.getPages())).toEqual([{ pageNumber: 7, text: "page 7" }, { pageNumber: 9, text: "page 9" }])
  expect(collectQuizPageTexts(collectQuizPages(storage))).toEqual([{ pageId: "p7", text: "page 7" }, { pageId: "p9", text: "page 9" }])
  expect(storage.getAllNodeVersions("web-rendering", "p2").filter(row => row.data !== null)).toEqual(before)
  expect(storage.getAllNodeVersions("web-rendering", "p7")).toEqual(neighbor)
})

// A readable viewport remains part of the book's shared scale even when that
// neighboring page cannot currently render its image input.
it("targeted fixed output keeps the full-window width beside unreadable classification", async () => {
  const positioned = storage.getLatestNodeData("positioned-text", "p2")!.data as Record<string, unknown>
  storage.putNodeData("positioned-text", "p2", { ...positioned, pageWidth: 1200 })
  storage.putNodeData("image-filtering", "p2", null)
  const neighbor = storage.getAllNodeVersions("web-rendering", "p2")
  await processFixedLayoutPages(storage, "/images", ["p7"])
  expect(JSON.stringify(storage.getLatestNodeData("web-rendering", "p7")?.data)).toContain('data-fl-reference-width=\"1200\"'.replaceAll('"', '\\"'))
  expect(storage.getAllNodeVersions("web-rendering", "p2")).toEqual(neighbor)
})
it.each(["pruned-image", "paragraph"])("included unpositioned images cannot disappear beside %s draw items", async kind => {
  const positioned = storage.getLatestNodeData("positioned-text", "p2")!.data as Record<string, unknown>
  const drawItems = kind === "pruned-image" ? [{ kind: "image", imageId: "pruned", bounds: { x: 0, y: 0, width: 10, height: 10 } }]
    : [{ kind: "paragraph", textId: "p2_text", text: "visible text", segments: [], top: 1, left: 1, lineHeight: 10 }]
  storage.putNodeData("positioned-text", "p2", { ...positioned, drawItems })
  const previous = storage.getAllNodeVersions("web-rendering", "p2"), unavailable: string[] = []
  await processFixedLayoutPages(storage, "/images", ["p2"], { onUnavailable: id => { unavailable.push(id) } })
  expect(unavailable).toEqual(["p2"])
  expect(storage.getAllNodeVersions("web-rendering", "p2")).toEqual(previous)
})
it("reset marks retained generator output for review without replacing it", async () => {
  const { captureSourceGeneration, publishSourceGeneration, getSourceGenerationUpdates } = await import("../source-generation-state.js")
  for (const step of ["glossary", "quiz-generation"] as const) {
    const receipt = captureSourceGeneration(storage, step)
    publishSourceGeneration(storage, receipt, () => storage.putNodeData(step, "book", { source: "manual", retained: true }))
  }
  expect(getSourceGenerationUpdates(storage)).toEqual([])
  resetSectioningStoryboard(storage, { fromStage: "sectioning", toStage: "sectioning", replaceManual: true, protectedReplacements: protectedAuthoredRecords(storage, "receipt").filter(record => record.itemId === "p2") }, "receipt")
  expect(getSourceGenerationUpdates(storage).sort()).toEqual(["glossary", "quiz-generation"])
  for (const step of ["glossary", "quiz-generation"]) expect(storage.getAllNodeVersions(step, "book").map(row => row.data)).toEqual([{ source: "manual", retained: true }])
})
