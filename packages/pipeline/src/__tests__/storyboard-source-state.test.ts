import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { PageSectioningOutput } from "@adt/types"
import { putSourceNodeData, withSourceGenerationTracking } from "../source-generation-state.js"
import { captureStoryboardSource, publishStoryboardSource, storyboardSourceWarnings } from "../storyboard-source-state.js"
import { storyboardCoverage } from "../storyboard-coverage.js"

let root: string, storage: ReturnType<typeof createBookStorage>
const tree = (text = "Original") => PageSectioningOutput.parse({ reasoning: "", sections: [1, 2].map(n => ({ sectionId: `p1_sec00${n}`, sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: `p1_t${n}`, role: "text", text: text + n, isPruned: false }] })) })
const html = () => ({ sections: [1, 2].map((n, sectionIndex) => ({ sectionId: `p1_sec00${n}`, sectionIndex, sectionType: "text", reasoning: "", html: `<section data-section-id="p1_sec00${n}"><p data-id="p1_t${n}">Original${n}</p></section>` })) })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-source-"))
  storage = createBookStorage("book", root)
  storage.putExtractedPage({ pageId: "p1", pageNumber: 1, text: "Original", pageImage: { imageId: "p1_page", buffer: Buffer.from("retained image"), hash: "image", width: 100, height: 100, format: "png" }, images: [] })
  storage.putNodeData("page-sectioning", "p1", tree())
  storage.putNodeData("web-rendering", "p1", html())
})
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("keeps unknown legacy output usable, then records an observed source edit independently of attempts", () => {
  const before = storage.getNodeVersionFingerprint()
  expect(storyboardSourceWarnings(storage)).toEqual([])
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
  const oldHtml = storage.getAllNodeVersions("web-rendering", "p1")
  putSourceNodeData(storage, "page-sectioning", "p1", tree("Changed"))
  storage.clearStepRuns(["web-rendering"])
  expect(storyboardCoverage(storage).complete).toBe(true)
  expect(storyboardSourceWarnings(storage)).toEqual([{ kind: "storyboard-source-changed", pageId: "p1" }])
  expect(storage.getAllNodeVersions("web-rendering", "p1")).toEqual(oldHtml)
  storage.close(); storage = createBookStorage("book", root)
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
  const cosmetic = html(); cosmetic.sections[0].html = cosmetic.sections[0].html.replace("<p ", '<p style="color:red" ')
  putSourceNodeData(storage, "web-rendering", "p1", cosmetic)
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
  storage.markStepCompleted("web-rendering")
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
})

it("targeted publication only accepts the rendered owners; old HTML restore keeps old evidence", () => {
  putSourceNodeData(storage, "page-sectioning", "p1", tree("Changed"))
  const prior = captureStoryboardSource(storage, "p1")
  storage.transaction(() => {
    storage.putNodeData("web-rendering", "p1", html())
    publishStoryboardSource(storage, "p1", prior, ["p1_sec001"])
  })
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
  storage.transaction(() => {
    const before = captureStoryboardSource(storage, "p1")
    storage.putNodeData("web-rendering", "p1", html())
    publishStoryboardSource(storage, "p1", before, ["p1_sec002"])
  })
  expect(storyboardSourceWarnings(storage)).toEqual([])
  withSourceGenerationTracking(storage, () => storage.setCurrentNodeVersion("web-rendering", "p1", 1))
  expect(storyboardSourceWarnings(storage)).toHaveLength(1)
  withSourceGenerationTracking(storage, () => storage.setCurrentNodeVersion("page-sectioning", "p1", 1))
  expect(storyboardSourceWarnings(storage)).toEqual([])
})

it("no-op and cosmetic source saves do not manufacture source changes", () => {
  const baseline = captureStoryboardSource(storage, "p1")
  publishStoryboardSource(storage, "p1", baseline)
  putSourceNodeData(storage, "page-sectioning", "p1", tree())
  const cosmetic = tree(); cosmetic.sections[0].backgroundColor = "red"
  putSourceNodeData(storage, "page-sectioning", "p1", cosmetic)
  expect(storyboardSourceWarnings(storage)).toEqual([])
})

it("a rolled-back source edit preserves state and never changes output", () => {
  const before = storage.getNodeVersionFingerprint()
  expect(() => withSourceGenerationTracking(storage, () => {
    putSourceNodeData(storage, "page-sectioning", "p1", tree("Rolled back"))
    throw new Error("cancel")
  })).toThrow("cancel")
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
  expect(storyboardSourceWarnings(storage)).toEqual([])
})

it.each(["__proto__", "constructor", "toString"])("tracks a valid public identity named %s without object-property aliasing", id => {
  const source = tree(); source.sections[0].sectionId = id
  const output = html(); output.sections[0].sectionId = id; output.sections[0].html = output.sections[0].html.replaceAll("p1_sec001", id)
  storage.putNodeData("page-sectioning", "p1", source)
  storage.putNodeData("web-rendering", "p1", output)
  const changed = structuredClone(source); changed.sections[0].nodes[0].text = "Changed"
  putSourceNodeData(storage, "page-sectioning", "p1", changed)
  expect(storyboardSourceWarnings(storage)).toEqual([{ kind: "storyboard-source-changed", pageId: "p1" }])
})


it("ownership stamping preserves source evidence when legacy HTML has no explicit section owner", () => {
  const legacy = html()
  for (const entry of legacy.sections) {
    delete (entry as Partial<typeof entry>).sectionId
    entry.html = entry.html.replace(/ data-section-id="[^"]+"/, "")
  }
  storage.putNodeData("web-rendering", "p1", legacy)
  putSourceNodeData(storage, "page-sectioning", "p1", tree("Changed"))
  expect(storyboardSourceWarnings(storage)).toEqual([{ kind: "storyboard-source-changed", pageId: "p1" }])
  expect(storyboardCoverage(storage).complete).toBe(true)
})
