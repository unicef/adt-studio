import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { PageSectioningSection, SectionRendering } from "@adt/types"
import { renderedSectionId, withLegacyRenderingOwnership } from "../render-sectioning.js"
import { putSourceNodeData } from "../source-generation-state.js"

let root: string
let storage: ReturnType<typeof createBookStorage>
const leaf = (nodeId: string) => ({ nodeId, role: "body_text", text: nodeId, isPruned: false })
const section = (sectionId: string, ids = [sectionId]): PageSectioningSection => ({
  sectionId, sectionType: "activity_custom", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
  nodes: [{ nodeId: `synthetic-${sectionId}`, structure: "group", isPruned: false, children: ids.map(leaf) }],
})
const rendering = (ids: string[], extra: Partial<SectionRendering> = {}): SectionRendering => ({
  sectionIndex: 42, sectionType: "activity_custom", reasoning: "retained",
  html: `<section>${ids.map(id => `<p data-id="${id}">${id}</p>`).join("")}</section>`,
  activityAnswers: { answer: "Manual answer" }, ...extra,
})
const resolve = (sources: PageSectioningSection[], outputs: SectionRendering[]) => {
  storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: sources })
  return withLegacyRenderingOwnership(storage, "pg001", { sections: outputs }).sections
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-leaf-owner-")); storage = createBookStorage("book", root) })
afterEach(() => { storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("matches all actual leaf IDs, ignoring synthetic containers and array positions without rewriting HTML", () => {
  const old = rendering(["text", "image"], { html: '<section data-id="copied-root"><p data-id="text">Text</p><img data-id="image"/><script>window.retained=true</script></section>' })
  const source = section("owner", ["text", "image"])
  source.nodes[0].children![1].role = "image"
  const result = resolve([section("other"), source], [old])
  expect(result).toEqual([{ ...old, sectionId: "owner" }])
  expect(old.sectionId).toBeUndefined()
})

it.each(["missing-leaf", "wrong-type", "empty", "containers-only", "script-only", "comment-only", "substring"])("does not claim a %s candidate", mode => {
  const source = section("owner", ["text", "second"])
  let output = rendering(["text", "second"])
  if (mode === "missing-leaf") output = rendering(["text"])
  if (mode === "wrong-type") source.sectionType = "content"
  if (mode === "empty") source.nodes = []
  if (mode === "containers-only") source.nodes = [{ nodeId: "text", structure: "group", children: [], isPruned: false }]
  if (mode === "script-only") output.html = '<script>const html = \'<p data-id="text"></p><p data-id="second"></p>\';</script>'
  if (mode === "comment-only") output.html = '<!-- <p data-id="text"></p><p data-id="second"></p> -->'
  if (mode === "substring") output = rendering(["text-longer", "second"])
  expect(resolve([source], [output])[0].sectionId).toBeUndefined()
})

it("does not read another page or consult history/media when matching", () => {
  storage.putNodeData("page-sectioning", "pg002", { reasoning: "", sections: [section("elsewhere", ["text"])] })
  const history = vi.spyOn(storage, "getAllNodeVersions").mockImplementation(() => { throw new Error("No historical reconstruction") })
  const media = vi.spyOn(storage, "getImageBase64").mockImplementation(() => { throw new Error("No media reads") })
  expect(resolve([section("here", ["other"])], [rendering(["text"])])[0].sectionId).toBeUndefined()
  expect(history).not.toHaveBeenCalled()
  expect(media).not.toHaveBeenCalled()
})

it.each([false, true])("requires mutual uniqueness including ambiguous competitors (reverse=%s)", reverse => {
  let outputs = [rendering(["a"]), rendering(["a", "b"])]
  if (reverse) outputs = outputs.reverse()
  expect(resolve([section("A", ["a"]), section("B", ["b"])], outputs).map(entry => entry.sectionId)).toEqual([undefined, undefined])
  expect(resolve([section("A", ["a"])], [rendering(["a"]), rendering(["a"])]).map(entry => entry.sectionId)).toEqual([undefined, undefined])
  expect(resolve([section("A", ["a"]), section("B", ["a"])], [rendering(["a"])])[0].sectionId).toBeUndefined()
})

it.each(["stored", "html", "contradictory", "empty-html", "duplicate-source"])("never steals an explicit or invalid %s claim", mode => {
  const sources = [section("A", ["a"]), section("B", ["b"])]
  let declared = rendering(["b"], { sectionId: "A" })
  if (mode === "html") declared = rendering(["b"], { html: '<section data-section-id="A"><p data-id="b">b</p></section>' })
  if (mode === "contradictory") declared.html = '<section data-section-id="B"><p data-id="b">b</p></section>'
  if (mode === "empty-html") declared = rendering(["a"], { html: '<section data-section-id=""><p data-id="a">a</p></section>' })
  if (mode === "duplicate-source") sources.push(section("A", ["different"]))
  const result = resolve(sources, [declared, rendering(["a"])])
  if (mode !== "empty-html") expect(result[1].sectionId).toBeUndefined()
  if (mode === "contradictory" || mode === "empty-html") expect(renderedSectionId(result[0])).toBeUndefined()
})

it("keeps reads version-free and freezes inferred ownership before a successful source move", () => {
  const a = section("A", ["text"]), b = section("B", ["other"])
  resolve([a, b], [])
  const original = { sections: [rendering(["text"])] }
  storage.putNodeData("web-rendering", "pg001", original)
  const before = storage.getAllNodeVersions("web-rendering", "pg001")
  expect(withLegacyRenderingOwnership(storage, "pg001", original).sections[0].sectionId).toBe("A")
  expect(storage.getAllNodeVersions("web-rendering", "pg001")).toEqual(before)
  putSourceNodeData(storage, "page-sectioning", "pg001", { reasoning: "moved", sections: [{ ...b, nodes: a.nodes }, { ...a, nodes: b.nodes }] })
  const saved = storage.getLatestNodeData("web-rendering", "pg001")!
  expect(saved.version).toBe(2)
  expect(saved.data).toEqual({ sections: [{ ...original.sections[0], sectionId: "A" }] })
  expect(storage.getAllNodeVersions("web-rendering", "pg001").find(row => row.version === 1)?.data).toEqual(original)
})

it("rolls back ownership materialization with a failed source edit", () => {
  resolve([section("A")], [])
  storage.putNodeData("web-rendering", "pg001", { sections: [rendering(["A"])] })
  const before = storage.getNodeVersionFingerprint()
  expect(() => storage.transaction(() => {
    putSourceNodeData(storage, "page-sectioning", "pg001", { reasoning: "", sections: [] })
    throw new Error("rejected edit")
  })).toThrow("rejected edit")
  expect(storage.getNodeVersionFingerprint()).toEqual(before)
})

it("accepts the documented whole-tree-movement limitation only for already unowned data", () => {
  const old = rendering(["text"])
  expect(resolve([section("new-owner", ["text"])], [old])[0].sectionId).toBe("new-owner")
  expect(resolve([section("new-owner", ["text"])], [{ ...old, sectionId: "old-owner" }])[0].sectionId).toBe("old-owner")
})
