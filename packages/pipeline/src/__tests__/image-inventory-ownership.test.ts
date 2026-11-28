import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, openBookDb } from "@adt/storage"
import type { PageSectioningSection, SectionRendering } from "@adt/types"
import { parseDocument } from "htmlparser2"
import { buildImageInventory } from "../catalog-reconciliation.js"
import * as ownership from "../render-sectioning.js"

vi.mock("htmlparser2", async importOriginal => {
  const actual = await importOriginal<typeof import("htmlparser2")>()
  return { ...actual, parseDocument: vi.fn(actual.parseDocument) }
})

let root: string
let storage: ReturnType<typeof createBookStorage>
const source = (id: string): PageSectioningSection => ({
  sectionId: id, sectionType: "content", backgroundColor: "white", textColor: "black",
  pageNumber: 1, isPruned: false, nodes: [{ nodeId: `img${id}`, role: "image", isPruned: false }],
})
const rendering = (id: string): SectionRendering => ({
  sectionId: id, sectionIndex: 0, sectionType: "content", reasoning: "retained",
  html: `<section data-section-id="${id}"><img data-id="img${id}"></section>`,
})
function put(sources = [source("A"), source("B"), source("C")], renderings = [rendering("A"), rendering("B"), rendering("C")]) {
  storage.putNodeData("page-sectioning", "p1", { reasoning: "", sections: sources })
  storage.putNodeData("web-rendering", "p1", { sections: renderings })
}
const read = () => storage.readSnapshot(() => buildImageInventory(storage))
function freeze(value: unknown): void {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) freeze(child) }
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-owners-"))
  storage = createBookStorage("book", root)
  const image = (imageId: string) => ({ imageId, buffer: Buffer.from(imageId), format: "png" as const, hash: imageId, width: 10, height: 10 })
  storage.putExtractedPage({ pageId: "p1", pageNumber: 1, text: "Source", pageImage: image("page"), images: ["A", "B", "C"].map(id => image(`img${id}`)) })
  put()
})
afterEach(() => { vi.restoreAllMocks(); storage.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("keeps inventory HTML parsing linear in the number of rendered sections", () => {
  vi.mocked(parseDocument).mockClear()
  expect(read().map(image => image.id)).toEqual(["imgA", "imgB", "imgC"])
  // Each section is parsed once for legacy declarations, once for its owner,
  // and once for images. Resolving competitors must not reparse their HTML.
  expect(parseDocument).toHaveBeenCalledTimes(9)
})

it.each(["normal", "duplicate-rendering", "duplicate-source", "contradictory", "empty-owner", "multiple-owners", "descendant-owner", "legacy", "pruned", "missing-source"])(
  "preserves complete inventory and unique ownership for %s", mode => {
    const sources = [source("A"), source("B"), source("C")]
    const renderings = [rendering("A"), rendering("B"), rendering("C")]
    if (mode === "duplicate-rendering") renderings.push(rendering("A"))
    if (mode === "duplicate-source") sources.push(source("A"))
    if (mode === "contradictory") renderings[0].sectionId = "B"
    if (mode === "empty-owner") renderings[0].html = '<section data-section-id=""><img data-id="imgA"></section>'
    if (mode === "multiple-owners") renderings[0].html += '<section data-section-id="B">Other</section>'
    if (mode === "descendant-owner") { delete renderings[0].sectionId; renderings[0].html = `<p>Unowned sibling</p>${renderings[0].html}` }
    if (mode === "legacy") for (const entry of renderings) { delete entry.sectionId; entry.html = entry.html.replace(/ data-section-id="[^"]+"/, "") }
    if (mode === "pruned") sources[0].isPruned = true
    if (mode === "missing-source") sources.shift()
    put(sources, renderings)
    const before = storage.getAllNodeVersions("web-rendering", "p1")
    const originalRead = storage.getLatestNodeData.bind(storage)
    vi.spyOn(storage, "getLatestNodeData").mockImplementation((...args) => { const row = originalRead(...args); freeze(row); return row })
    const actual = read()
    const resolver = ownership.resolveRenderedSection
    // Force the original uncached path as a differential oracle.
    const oracle = vi.spyOn(ownership, "resolveRenderedSection").mockImplementation((entry, sections, entries) => resolver(entry, sections, entries))
    expect(actual).toEqual(read())
    expect(oracle).toHaveBeenCalled()
    expect(actual.map(image => image.id)).toEqual(mode === "normal" || mode === "legacy" ? ["imgA", "imgB", "imgC"] : ["imgB", "imgC"])
    expect(actual.every(image => image.available)).toBe(true)
    expect(storage.getAllNodeVersions("web-rendering", "p1")).toEqual(before)
  },
)

it("keeps legacy fixed-page inference and explicit contradictory owners unchanged", () => {
  const fixed = { ...source("A"), sectionType: "fixed-layout-page" }
  storage.putNodeData("fixed-layout-sectioning", "p1", { reasoning: "fixed", sections: [fixed] })
  const entry = { ...rendering("A"), sectionId: undefined, sectionType: "fixed-layout-page", html: '<div id="content"><img data-id="imgA"></div>' }
  storage.putNodeData("web-rendering", "p1", { sections: [entry] })
  expect(read()).toMatchObject([{ id: "imgA", sectionIds: ["A"], available: true }])
  storage.putNodeData("web-rendering", "p1", { sections: [{ ...entry, html: '<div id="content" DATA-SECTION-ID="other"><img data-id="imgA"></div>' }] })
  expect(read()).toEqual([])
})

it("rechecks restored and rewritten owners and current asset availability on every inventory", () => {
  const original = storage.getLatestNodeData("web-rendering", "p1")!
  expect(read()).toHaveLength(3)
  storage.putNodeData("web-rendering", "p1", { sections: [{ ...rendering("A"), sectionId: "B" }, rendering("B"), rendering("C")] })
  expect(read().map(image => image.id)).toEqual(["imgB", "imgC"])
  storage.setCurrentNodeVersion("web-rendering", "p1", original.version)
  expect(read()).toHaveLength(3)
  const db = openBookDb(path.join(storage.bookDir!, "book.db"))
  try { db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=?", [JSON.stringify({ sections: [rendering("B")] }), "web-rendering", "p1", original.version]) }
  finally { db.close() }
  expect(read()).toMatchObject([{ id: "imgB", sectionIds: ["B"], available: true }])
  const image = storage.getImageMeta("imgB")!
  const file = path.join(storage.bookDir!, image.relativePath), bytes = fs.readFileSync(file)
  fs.unlinkSync(file)
  expect(read()).toMatchObject([{ id: "imgB", available: false }])
  fs.writeFileSync(file, bytes)
  expect(read()).toMatchObject([{ id: "imgB", available: true }])
})
