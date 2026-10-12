import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { buildTextCatalogSnapshot, buildImageInventory, buildEasyReadSourceBlocks, resolveReadingOrder, packageAdtWeb, loadBookConfig, renderingOwnershipWarnings } from "@adt/pipeline"
import type { PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { createOutputRoutes } from "./outputs.js"

let root: string
const label = "ownership"
const storage = () => createBookStorage(label, root)
const sections: PageSectioningOutput = { reasoning: "", sections: ["A", "B"].map((id) => ({ sectionId: id, sectionType: "activity_fill_in_the_blank", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: `text-${id}`, role: "body_text", text: `Question ${id}`, isPruned: false }] })) }
const rendering: WebRenderingOutput = { sections: ["A", "B"].map((id, i) => ({ sectionIndex: i, sectionType: "activity_fill_in_the_blank", reasoning: "", html: `<section data-section-id="${id}"><p data-id="text-${id}">Question ${id}</p><img data-id="image-${id}"/><input data-activity-item="item-1"/></section>`, activityAnswers: { "item-1": i === 0 ? "sun" : "moon" } })) }
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-rendered-ownership-"))
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", sections)
  db.putNodeData("web-rendering", "pg001", rendering)
  db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "A_ans_item-1", text: "Manuel Soleil", source: "manual" }, { id: "B_ans_item-1", text: "Manuel Lune", source: "manual" }], generatedAt: "before" })
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "editing_language: en\noutput_languages: [en, fr]\n")
  db.close()
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })
const answerMap = () => { const db = storage(); try { return Object.fromEntries(buildTextCatalogSnapshot(db, db.getPages()).entries.filter((entry) => entry.id.includes("_ans_")).map((entry) => [entry.id, entry.text])) } finally { db.close() } }

it("AC-4/9 keeps answers, contexts, images and packaged corrections with their owner across source reorder, prune and restore", async () => {
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"))
  const before = storage(); const corrections = before.getLatestNodeData("text-catalog-translation", "fr"); const raw = before.getLatestNodeData("web-rendering", "pg001"); before.close()
  const provider = vi.fn(() => { throw new Error("Save must not generate") }); vi.stubGlobal("fetch", provider)
  const reordered = { ...sections, sections: [...sections.sections].reverse() }
  const response = await app.request(`/books/${label}/pages/pg001/sectioning`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...reordered, baseVersion: 1 }) })
  expect(response.status).toBe(200)
  expect(answerMap()).toEqual({ "A_ans_item-1": "sun", "B_ans_item-1": "moon" })
  const db = storage()
  try {
    expect(db.getLatestNodeData("web-rendering", "pg001")).toEqual(raw)
    expect(db.getLatestNodeData("text-catalog-translation", "fr")).toEqual(corrections)
    expect(buildImageInventory(db).map(({ id, sectionIds }) => ({ id, sectionIds }))).toEqual([{ id: "image-A", sectionIds: ["A"] }, { id: "image-B", sectionIds: ["B"] }])
    expect(buildEasyReadSourceBlocks(db, db.getPages()).map((block) => [block.sectionId, block.entries[0].sourceId])).toEqual([["A", "text-A"], ["B", "text-B"]])
    expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["A", "B"])
    await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en", "fr"], title: "Owners", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/A.html"), "utf8")).toContain('"item-1":"sun"')
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/B.html"), "utf8")).toContain('"item-1":"moon"')
    db.putNodeData("page-sectioning", "pg001", { ...reordered, sections: reordered.sections.map((section) => ({ ...section, isPruned: section.sectionId === "A" })) })
    expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["B"])
    expect(buildImageInventory(db).map((item) => item.id)).toEqual(["image-B"])
    expect(buildEasyReadSourceBlocks(db, db.getPages()).map((block) => block.sectionId)).toEqual(["B"])
    expect(buildTextCatalogSnapshot(db, db.getPages()).entries.filter((entry) => entry.id.includes("_ans_")).map((entry) => entry.id)).toEqual(["B_ans_item-1"])
    db.setCurrentNodeVersion("page-sectioning", "pg001", 1)
    expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["A", "B"])
    expect(db.getLatestNodeData("text-catalog-translation", "fr")).toEqual(corrections)
  } finally { db.close() }
  expect(provider).not.toHaveBeenCalled()
})

it.each(["removed", "identityless", "conflicting", "nested"] as const)("AC-4/12 retains and discloses %s owners without assigning another section's answers", async (scenario) => {
  const db = storage()
  const next = structuredClone(rendering)
  if (scenario === "identityless") next.sections[0].html = next.sections[0].html.replace(' data-section-id="A"', "")
  if (scenario === "conflicting") next.sections[0].sectionId = "B"
  if (scenario === "nested") next.sections[0].html += '<section data-section-id="B"></section>'
  db.putNodeData("web-rendering", "pg001", next)
  // Stable leaves can move while an old rendering remains: they do not prove ownership.
  db.putNodeData("page-sectioning", "pg001", { ...sections, sections: [{ ...sections.sections[1], nodes: sections.sections[0].nodes }] })
  const raw = db.getAllNodeVersions("web-rendering", "pg001")
  const corrections = db.getLatestNodeData("text-catalog-translation", "fr")
  expect(buildTextCatalogSnapshot(db, db.getPages()).entries.find((entry) => entry.id === "B_ans_item-1")?.text).toBe("moon")
  expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["B"])
  expect(renderingOwnershipWarnings(db)).toEqual([{ kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 0 }])
  db.close()
  const app = createOutputRoutes(root, path.resolve("prompts"))
  for (const suffix of ["", "/disclosure"]) {
    const response = await app.request(`/books/${label}/outputs${suffix}`)
    expect(response.status).toBe(200)
    expect((await response.json()).ownershipWarnings).toHaveLength(1)
  }
  const reopened = storage()
  expect(reopened.getAllNodeVersions("web-rendering", "pg001")).toEqual(raw)
  expect(reopened.getLatestNodeData("text-catalog-translation", "fr")).toEqual(corrections)
  reopened.close()
})
