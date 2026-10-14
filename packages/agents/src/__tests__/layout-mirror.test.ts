import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import { SOURCE_GENERATION_RESET_STEPS } from "@adt/types"
const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }))
vi.mock("@adt/llm", () => ({ createLLMModel: () => ({ generateObject }) }))
import { mirrorLayout } from "../layout-mirror.js"
let root: string
let db: Storage
const owner = "pg001_sec001"
const html = `<section data-section-id="${owner}"><p data-id="pg001_t001">First</p><p data-id="pg001_t002">Second</p><p data-id="pg001_t003">Third</p><p data-id="pg001_t004">Fourth</p></section>`
const rendering = { sections: [{ sectionId: owner, sectionIndex: 0, sectionType: "text", reasoning: "fixture", html }] }
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-mirror-attempts-"))
  db = createBookStorage("book", root)
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
  // Native Sectioning is not already flattened by the agent's HTML builder.
  db.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [{
    sectionId: owner, sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
    nodes: ["First", "Second", "Third", "Fourth"].map((text, index) => ({ nodeId: `pg001_t00${index + 1}`, role: "text", text, isPruned: false })),
  }] })
  db.putNodeData("web-rendering", "pg001", rendering)
  for (const step of [...SOURCE_GENERATION_RESET_STEPS, "tts", "catalog-translation"]) db.markStepCompleted(step)
  for (const node of ["glossary", "quiz-generation", "toc-generation"]) db.putNodeData(node, "book", { manual: "retained" })
  generateObject.mockReset()
})
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })
it.each(["cosmetic", "substantive", "conflict", "failure"])("handles %s mirroring without deleting content or resetting unrelated attempts", async (mode) => {
  generateObject.mockImplementation(async () => {
    if (mode === "failure") throw new Error("provider failed")
    if (mode === "conflict") db.putNodeData("web-rendering", "pg001", rendering)
    return { object: { reasoning: "mirror", content: mode === "cosmetic" ? html.replace("<section ", '<section style="color:red" ') : html.replace('<p data-id="pg001_t004">Fourth</p>', "") } }
  })
  const result = await mirrorLayout({ storage: db, bookLabel: "book", booksDir: root, source: { pageId: "pg001", sectionIndex: 0 }, targets: [{ pageId: "pg001", sectionIndex: 0 }], modelId: "fixture" })
  expect(result.results[0].ok).toBe(mode === "cosmetic" || mode === "substantive")
  const steps = db.getStepRuns().map((run) => run.step)
  for (const step of SOURCE_GENERATION_RESET_STEPS) expect(steps.includes(step)).toBe(step === "toc-generation" || mode !== "substantive")
  expect(steps).toEqual(expect.arrayContaining(["tts", "catalog-translation"]))
  for (const node of ["glossary", "quiz-generation", "toc-generation"]) expect(db.getAllNodeVersions(node, "book").map((row) => row.data)).toEqual([{ manual: "retained" }])
  expect(db.getAllNodeVersions("web-rendering", "pg001")[0].data).toEqual(rendering)
})

it.each(["unique", "ambiguous"])("uses pre-edit leaf ownership for %s legacy mirror targets", async mode => {
  const legacy = { sections: [{ ...rendering.sections[0], sectionId: undefined, html: html.replace(` data-section-id="${owner}"`, "") }] }
  if (mode === "ambiguous") legacy.sections.push({ ...legacy.sections[0], sectionIndex: 1 })
  db.putNodeData("web-rendering", "pg001", legacy)
  const history = db.getAllNodeVersions("web-rendering", "pg001")
  generateObject.mockResolvedValue({ object: { reasoning: "cosmetic", content: legacy.sections[0].html.replace("<section", '<section style="color:red"') } })
  const result = await mirrorLayout({ storage: db, bookLabel: "book", booksDir: root, source: { pageId: "pg001", sectionIndex: 0 }, targets: [{ pageId: "pg001", sectionIndex: 0 }], modelId: "fixture" })
  expect(result.results[0].ok).toBe(mode === "unique")
  expect(generateObject).toHaveBeenCalledTimes(mode === "unique" ? 1 : 0)
  if (mode === "unique") {
    expect(db.getLatestNodeData("web-rendering", "pg001")?.data).toMatchObject({ sections: [{ sectionId: owner }] })
    expect(db.getStepRuns().map(run => run.step)).toEqual(expect.arrayContaining(SOURCE_GENERATION_RESET_STEPS))
  } else expect(db.getAllNodeVersions("web-rendering", "pg001")).toEqual(history)
})

it("mirrors the section displayed by the editor after source reorder, retaining the other legacy owner", async () => {
  const source = db.getLatestNodeData("page-sectioning", "pg001")!.data as import("@adt/types").PageSectioningOutput
  const other = { ...source.sections[0], sectionId: "pg001_sec002", nodes: source.sections[0].nodes.map(node => ({ ...node, nodeId: node.nodeId + "-B", text: node.text + " B" })) }
  db.putNodeData("page-sectioning", "pg001", { ...source, sections: [other, ...source.sections] })
  const oldA = { ...rendering.sections[0], sectionId: undefined, html: html.replace(` data-section-id="${owner}"`, "") }
  const oldB = { ...oldA, sectionIndex: 1, html: oldA.html.replace(/pg001_t00([1-4])/g, "pg001_t00$1-B") }
  db.putNodeData("web-rendering", "pg001", { sections: [oldA, oldB] })
  generateObject.mockResolvedValue({ object: { reasoning: "B only", content: oldB.html.replace("<section", '<section style="color:red"') } })
  const result = await mirrorLayout({ storage: db, bookLabel: "book", booksDir: root, source: { pageId: "pg001", sectionIndex: 1 }, targets: [{ pageId: "pg001", sectionIndex: 0 }], modelId: "fixture" })
  expect(result.results[0].ok).toBe(true)
  const saved = db.getLatestNodeData("web-rendering", "pg001")!.data as import("@adt/types").WebRenderingOutput
  expect(saved.sections.find(entry => entry.sectionId === owner)?.html).toBe(oldA.html)
  expect(saved.sections.find(entry => entry.sectionId === other.sectionId)?.html).toContain('style="color:red"')
})
