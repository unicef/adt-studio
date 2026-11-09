import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import { SourceGeneratorStep, type PageSectioningOutput, type WebRenderingOutput } from "@adt/types"
import { putReflowableRendering, putSourceNodeData, withSourceGenerationTracking, captureSourceGeneration, publishSourceGeneration, getSourceGenerationUpdates, keepSourceGeneration } from "../source-generation-state.js"
import { resolveReadingOrder } from "../reading-order.js"
import { getRenderSectioningSelection } from "../render-sectioning.js"
import { collectPageTexts } from "../glossary.js"
import { collectQuizPages, collectQuizPageTexts } from "../quiz-generation.js"

let root: string
let db: Storage
const section = { sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
  nodes: [{ nodeId: "pg001_t001", isPruned: false, role: "heading", text: "Hello", headingLevel: 1 },
    { nodeId: "pg001_t002", isPruned: false, role: "body_text", text: "Body", headingLevel: 1 }] }
const sectioning: PageSectioningOutput = { reasoning: "fixture", sections: [section] }
const rendering: WebRenderingOutput = { sections: [{ sectionIndex: 0, sectionId: section.sectionId, sectionType: "content", reasoning: "fixture",
  html: '<div data-section-id="pg001_sec001"><h1 data-id="pg001_t001">Hello</h1><p data-id="pg001_t002">Body</p><img data-id="pg001_im001" alt="Tree"></div>' }] }
const catalogSteps = ["image-captioning", "easy-read", "catalog-translation", "core-tts-catalog", "tts", "word-timestamps", "package-web"]
function addPage(id: string, number: number) {
  db.putExtractedPage({ pageId: id, pageNumber: number, text: "", pageImage: { imageId: `${id}_page`, buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
}
function publish(step: SourceGeneratorStep, policy = step === "quiz-generation" ? { quiz: { pagesPerQuiz: 2, quizSectionTypes: ["content"] } } : step === "toc-generation" ? { tocMode: "extract" as const } : {}) {
  const receipt = captureSourceGeneration(db, step, policy)
  publishSourceGeneration(db, receipt, () => db.putNodeData(step, "book", { manual: "latest" }))
  db.markStepCompleted(step)
}
function expectUpdates(steps: SourceGeneratorStep[]) {
  expect(getSourceGenerationUpdates(db).sort()).toEqual([...steps].sort())
  const attempts = db.getStepRuns().map(run => run.step)
  for (const step of SourceGeneratorStep.options) expect(attempts.includes(step), step).toBe(!steps.includes(step))
  for (const step of catalogSteps) expect(attempts).toContain(step)
  for (const node of SourceGeneratorStep.options) expect(db.getAllNodeVersions(node, "book").map(row => row.data)).toEqual([{ manual: "older" }, { manual: "latest" }])
  expect(fs.readFileSync(path.join(db.bookDir!, "retained.wav"), "utf8")).toBe("historical physical audio")
}
function editHtml(edit: (html: string) => string) {
  putSourceNodeData(db, "web-rendering", "pg001", { sections: [{ ...rendering.sections[0], html: edit(rendering.sections[0].html) }] })
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-source-attempts-"))
  db = createBookStorage("book", root)
  addPage("pg001", 1)
  db.putNodeData("page-sectioning", "pg001", sectioning)
  db.putNodeData("web-rendering", "pg001", rendering)
  for (const step of SourceGeneratorStep.options) { db.putNodeData(step, "book", { manual: "older" }); publish(step) }
  for (const step of catalogSteps) db.markStepCompleted(step)
  fs.writeFileSync(path.join(db.bookDir!, "retained.wav"), "historical physical audio")
})
afterEach(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })

it("keeps attempts and prompt text unchanged for palette, CSS, scripts, placement, image IDs and dimensions", () => {
  const glossary = collectPageTexts(db, db.getPages())
  const quiz = collectQuizPageTexts(collectQuizPages(db))
  const media = vi.spyOn(db, "getImageBase64").mockImplementation(() => { throw new Error("No media reads") })
  putSourceNodeData(db, "page-sectioning", "pg001", { ...sectioning, reasoning: "new", sections: [{ ...section, backgroundColor: "red", placement: {}, viewport: { width: 10, height: 20 } }] })
  editHtml(html => '<style>.red{color:red}</style><script>window.changed=true</script>' + html.replace('<h1 ', '<h1 style="color:red; margin:10px" ').replace('<img ', '<img width="200" height="100" ').replace('pg001_im001', 'pg001_im002'))
  expect(collectPageTexts(db, db.getPages())).toEqual(glossary)
  expect(collectQuizPageTexts(collectQuizPages(db))).toEqual(quiz)
  expectUpdates([])
  expect(media).not.toHaveBeenCalled()
})
it("resets only Quiz and Glossary for a real body edit with unchanged TOC headings", () => {
  withSourceGenerationTracking(db, () => {
    editHtml(html => html.replace('>Body<', '>Changed body<'))
    putSourceNodeData(db, "page-sectioning", "pg001", { ...sectioning, sections: [{ ...section, nodes: section.nodes.map(node => node.role === "body_text" ? { ...node, text: "Changed body" } : node) }] })
  })
  expectUpdates(["quiz-generation", "glossary"])
})
it("resets TOC only for its first source heading, leaving rendered-text generators unchanged", () => {
  putSourceNodeData(db, "page-sectioning", "pg001", { ...sectioning, sections: [{ ...section, nodes: [{ ...section.nodes[0], text: "New heading" }, section.nodes[1]] }] })
  expectUpdates(["toc-generation"])
})
it("ignores later headings and non-heading source text until rendered generator inputs change", () => {
  putSourceNodeData(db, "page-sectioning", "pg001", { ...sectioning, sections: [{ ...section, nodes: [...section.nodes, { ...section.nodes[0], nodeId: "later", text: "Second heading" }] }] })
  expectUpdates([])
})
it.each(["extract", "dynamic"] as const)("uses original TOC text only in %s mode", mode => {
  db.putNodeData("page-sectioning", "pg001", { ...sectioning, sections: [{ ...section, sectionType: "table_of_contents" }] })
  db.putNodeData("web-rendering", "pg001", { sections: [{ ...rendering.sections[0], sectionType: "table_of_contents" }] })
  publish("toc-generation", { tocMode: mode })
  editHtml(html => html.replace(">Body<", ">Changed printed TOC<"))
  expect(getSourceGenerationUpdates(db).includes("toc-generation")).toBe(mode === "extract")
})
it("resets all affected generators on prune and retains every version and asset", () => {
  putSourceNodeData(db, "page-sectioning", "pg001", { ...sectioning, sections: [{ ...section, isPruned: true }] })
  expectUpdates(["quiz-generation", "glossary", "toc-generation"])
})
it("does not dirty text generators when adding an empty page, but updates TOC page structure", () => {
  withSourceGenerationTracking(db, () => addPage("pg002", 2))
  expectUpdates(["toc-generation"])
})
it("ignores text on ineligible quiz pages, but detects new eligibility and batch membership", () => {
  addPage("pg002", 2)
  db.putNodeData("page-sectioning", "pg002", { ...sectioning, sections: [{ ...section, sectionId: "other", sectionType: "excluded" }] })
  db.putNodeData("web-rendering", "pg002", { sections: [{ ...rendering.sections[0], sectionId: "other", html: '<p>Excluded text</p>' }] })
  putSourceNodeData(db, "web-rendering", "pg002", { sections: [{ ...rendering.sections[0], sectionId: "other", html: '<p>Changed excluded text</p>' }] })
  expect(getSourceGenerationUpdates(db)).toEqual(["glossary"])
  putSourceNodeData(db, "page-sectioning", "pg002", { ...sectioning, sections: [{ ...section, sectionId: "other", sectionType: "content" }] })
  expect(getSourceGenerationUpdates(db)).toContain("quiz-generation")
})
it("tracks restoration against the pre-restore snapshot", () => {
  editHtml(html => html.replace("Body", "New body"))
  publish("glossary"); publish("quiz-generation")
  withSourceGenerationTracking(db, () => db.setCurrentNodeVersion("web-rendering", "pg001", 1))
  expect(getSourceGenerationUpdates(db).sort()).toEqual(["glossary", "quiz-generation"])
})
it("retains warnings through reload, failure, skipped steps, cancellation, run preparation and manual edits", () => {
  editHtml(html => html.replace("Body", "New body"))
  db.markStepStarted("glossary"); db.recordStepError("glossary", "provider failed")
  db.clearStepRuns(["glossary"]); db.markStepSkipped("glossary")
  db.markStepStarted("quiz-generation"); db.clearRunningStepRuns()
  db.putNodeData("glossary", "book", { manual: "edited while outdated" })
  db.close(); db = createBookStorage("book", root)
  expect(getSourceGenerationUpdates(db).sort()).toEqual(["glossary", "quiz-generation"])
  db.markStepCompleted("glossary")
  expect(getSourceGenerationUpdates(db)).toContain("glossary")
  const receipt = captureSourceGeneration(db, "glossary")
  expect(() => publishSourceGeneration(db, receipt, () => { db.putNodeData("glossary", "book", { items: [] }); throw new Error("publish rejected") })).toThrow("publish rejected")
  expect(db.getLatestNodeData("glossary", "book")?.data).toEqual({ manual: "edited while outdated" })
  expect(getSourceGenerationUpdates(db)).toContain("glossary")
  publishSourceGeneration(db, receipt, () => db.putNodeData("glossary", "book", { items: [] }))
  expect(getSourceGenerationUpdates(db)).toEqual(["quiz-generation"])
})
it("rejects a late result captured before a concurrent source write without clearing the warning", () => {
  const receipt = captureSourceGeneration(db, "glossary")
  editHtml(html => html.replace("Body", "New body"))
  const save = vi.fn(() => db.putNodeData("glossary", "book", { stale: true }))
  expect(() => publishSourceGeneration(db, receipt, save)).toThrow("Source inputs changed")
  expect(save).not.toHaveBeenCalled()
  expectUpdates(["quiz-generation", "glossary"])
})
it("rolls back source writes, resets and warning metadata together", () => {
  expect(() => withSourceGenerationTracking(db, () => {
    editHtml(html => html.replace("Body", "Rejected body"))
    throw new Error("conflict")
  })).toThrow("conflict")
  expect(db.getLatestNodeData("web-rendering", "pg001")?.version).toBe(1)
  expectUpdates([])
})
it("allows edits beside malformed legacy rendering, conservatively marking unprovable generators", () => {
  addPage("pg002", 2)
  db.putNodeData("page-sectioning", "pg002", sectioning)
  db.putNodeData("web-rendering", "pg002", { invalid: true })
  editHtml(html => html.replace("Body", "New body"))
  expectUpdates(["quiz-generation", "glossary"])
})
it("legacy quiz coverage ignores other text but conservatively notices possible new eligible section types", () => {
  db.clearNodesByType(["source-generation-state"])
  db.putNodeData("quiz-generation", "book", { generatedAt: "before", language: "en", pagesPerQuiz: 1, quizzes: [{ quizIndex: 0, pageIds: ["pg001"], afterPageId: "pg001", question: "Q", options: [{ text: "A", explanation: "A" }, { text: "B", explanation: "B" }, { text: "C", explanation: "C" }], answerIndex: 0, reasoning: "" }] })
  addPage("pg002", 2)
  const other = { ...sectioning, sections: [{ ...section, sectionId: "other", sectionType: "excluded" }] }
  db.putNodeData("page-sectioning", "pg002", other)
  db.putNodeData("web-rendering", "pg002", { sections: [{ ...rendering.sections[0], sectionId: "other", html: '<p>Other</p>' }] })
  putSourceNodeData(db, "web-rendering", "pg002", { sections: [{ ...rendering.sections[0], sectionId: "other", html: '<p>Different</p>' }] })
  expect(getSourceGenerationUpdates(db)).not.toContain("quiz-generation")
  putSourceNodeData(db, "page-sectioning", "pg002", { ...other, sections: [{ ...other.sections[0], sectionType: "content" }] })
  expect(getSourceGenerationUpdates(db)).toContain("quiz-generation")
})

it("detects index-only reading-order changes without resetting unchanged text generators", () => {
  const other = { ...section, sectionId: "pg001_sec002", nodes: [{ ...section.nodes[0], nodeId: "other-heading", text: "Second" }] }
  db.putNodeData("page-sectioning", "pg001", { ...sectioning, sections: [section, other] })
  const before = { sections: [rendering.sections[0], { ...rendering.sections[0], sectionId: other.sectionId, sectionIndex: 1, html: '<h1 data-id="other-heading">Second</h1>' }] }
  db.putNodeData("web-rendering", "pg001", before)
  putSourceNodeData(db, "web-rendering", "pg001", { sections: before.sections.map((entry, i) => ({ ...entry, sectionIndex: 1 - i })) })
  expect(resolveReadingOrder(db, { includeQuizzes: false }).items.map(item => item.id)).toEqual(["pg001_sec002", "pg001_sec001"])
  expectUpdates(["toc-generation"])
})

it("publishes a fixed-to-reflow strategy switch per page atomically, retaining neighbors and restorable old pairs", () => {
  addPage("pg002", 2)
  for (const id of ["pg001", "pg002"]) {
    const fixed = { ...section, sectionId: `${id}_fixed`, sectionType: "fixed-layout-page" }
    db.putNodeData("fixed-layout-sectioning", id, { reasoning: "positioned", sections: [fixed] })
    db.putNodeData("web-rendering", id, { sections: [{ ...rendering.sections[0], sectionId: fixed.sectionId, sectionType: fixed.sectionType, html: `<p data-section-id="${fixed.sectionId}">Fixed</p>` }] })
  }
  const before = db.getLatestNodeData("fixed-layout-sectioning", "pg001")
  const neighbor = db.getLatestNodeData("fixed-layout-sectioning", "pg002")
  expect(() => db.transaction(() => { putReflowableRendering(db, "pg001", rendering); throw new Error("rollback") })).toThrow("rollback")
  expect(db.getLatestNodeData("fixed-layout-sectioning", "pg001")).toEqual(before)
  expect(resolveReadingOrder(db, { includeQuizzes: false }).items.map(item => item.id)).toEqual(["pg001_fixed", "pg002_fixed"])
  putReflowableRendering(db, "pg001", rendering)
  expect(getRenderSectioningSelection(db, "pg001")?.node).toBe("page-sectioning")
  expect(db.getLatestNodeData("fixed-layout-sectioning", "pg002")).toEqual(neighbor)
  expect(db.getAllNodeVersions("fixed-layout-sectioning", "pg001")[0]).toEqual(before)
  expect(resolveReadingOrder(db, { includeQuizzes: false }).items.map(item => item.id)).toEqual(["pg001_sec001", "pg002_fixed"])
})

it("does not dirty malformed legacy books on cosmetic paired saves", () => {
  addPage("pg002", 2)
  db.putNodeData("page-sectioning", "pg002", sectioning)
  db.putNodeData("web-rendering", "pg002", { invalid: true })
  withSourceGenerationTracking(db, () => editHtml(html => html.replace('<p ', '<p style="color:red" ')))
  expectUpdates([])
})
it("keeps retained content as the accepted baseline until the next source change", () => {
  editHtml(html => html.replace("Body", "New body"))
  expect(getSourceGenerationUpdates(db).sort()).toEqual(["glossary", "quiz-generation"])
  const kept = keepSourceGeneration(db, "glossary")
  expect(kept).toEqual({ version: 1, needsUpdate: false, policy: {}, inputSignature: captureSourceGeneration(db, "glossary").inputSignature })
  expect(getSourceGenerationUpdates(db)).toEqual(["quiz-generation"])
  expect(db.getStepRuns().find(run => run.step === "glossary")?.status).toBe("done")
  // Nothing was generated: content versions and the retained asset are untouched.
  expect(db.getAllNodeVersions("glossary", "book").map(row => row.data)).toEqual([{ manual: "older" }, { manual: "latest" }])
  expect(fs.readFileSync(path.join(db.bookDir!, "retained.wav"), "utf8")).toBe("historical physical audio")
  db.close(); db = createBookStorage("book", root)
  expect(getSourceGenerationUpdates(db)).toEqual(["quiz-generation"])
  editHtml(html => html.replace("New body", "Newer body"))
  expect(getSourceGenerationUpdates(db).sort()).toEqual(["glossary", "quiz-generation"])
})
