import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { JSDOM } from "jsdom"
import { createBookStorage, openBookDb } from "@adt/storage"
import { captureSourceGeneration, publishSourceGeneration, getSourceGenerationUpdates, storyboardSourceWarnings, putSourceNodeData } from "@adt/pipeline"
import { captureStoryboardSource, publishStoryboardSource } from "../../../../packages/pipeline/src/storyboard-source-state.js"
import { SourceGeneratorStep, type PageSectioningOutput, type WebRenderingOutput } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { backPropagateTextChanges } from "../../../studio/src/components/pipeline/stages/storyboard/lib/back-propagate-text.js"
const observedReads = vi.hoisted(() => [] as string[])
vi.mock("@adt/storage", async importOriginal => {
  const original = await importOriginal<typeof import("@adt/storage")>()
  return { ...original, createBookStorage: (...args: Parameters<typeof original.createBookStorage>) => {
    const db = original.createBookStorage(...args)
    const read = db.getLatestNodeData
    db.getLatestNodeData = (node, itemId) => {
      if (node === "web-rendering") observedReads.push(itemId)
      return read(node, itemId)
    }
    return db
  } }
})
let root: string
const label = "blank"
const sections: PageSectioningOutput = { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "activity_fill_in_the_blank", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
  nodes: [{ nodeId: "heading", role: "heading", text: "Weather", isPruned: false }, { nodeId: "question", role: "body_text", text: "The sky is [placeholder:blue].", isPruned: false }] }] }
const rendering: WebRenderingOutput = { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "activity_fill_in_the_blank", reasoning: "", html: '<section data-section-id="pg001_sec001"><h1 data-id="heading">Weather</h1><p data-id="question">The sky is <input data-activity-item="item-1">.</p></section>', activityAnswers: { "item-1": "blue" } }] }
const storage = () => createBookStorage(label, root)
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-editor-source-"))
  const dom = new JSDOM(); vi.stubGlobal("DOMParser", dom.window.DOMParser); vi.stubGlobal("Node", dom.window.Node)
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
  db.putNodeData("page-sectioning", "pg001", sections); db.putNodeData("web-rendering", "pg001", rendering)
  db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_sec001_ans_item-1", text: "bleu manuel", source: "manual" }], generatedAt: "before" })
  for (const step of SourceGeneratorStep.options) {
    publishSourceGeneration(db, captureSourceGeneration(db, step), () => db.putNodeData(step, "book", { retained: true }))
    db.markStepCompleted(step)
  }
  db.markStepCompleted("tts"); db.close()
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })
it.each([false, true])("passes the real editor projection through atomic Save without losing response spaces (genuine edit=%s)", async genuine => {
  const provider = vi.fn(() => { throw new Error("Save must not call a provider") }); vi.stubGlobal("fetch", provider)
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), path.resolve("config.yaml"))
  const editedHtml = rendering.sections[0].html.replace('<p ', '<p style="color:red" ').replace("The sky is", genuine ? "The evening sky is" : "The sky is")
  const edited = backPropagateTextChanges(sections, 0, editedHtml, rendering.sections[0].html)
  const response = await app.request(`/books/${label}/pages/pg001/storyboard`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: 1, renderingBaseVersion: 1, rendering: { sections: [{ ...rendering.sections[0], html: editedHtml }] }, ...(edited === sections ? {} : { sectioning: edited, renderingInSync: true }) }) })
  expect(response.status).toBe(200)
  const db = storage()
  try {
    expect((db.getLatestNodeData("page-sectioning", "pg001")!.data as PageSectioningOutput).sections[0].nodes[1].text).toBe(genuine ? "The evening sky is [placeholder:blue]." : "The sky is [placeholder:blue].")
    expect(db.getAllNodeVersions("page-sectioning", "pg001")).toHaveLength(genuine ? 2 : 1)
    expect(db.getAllNodeVersions("page-sectioning", "pg001")[0].data).toEqual(sections)
    expect((db.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput).sections[0].activityAnswers).toEqual({ "item-1": "blue" })
    expect(db.getLatestNodeData("text-catalog-translation", "fr")?.data).toMatchObject({ entries: [{ id: "pg001_sec001_ans_item-1", text: "bleu manuel", source: "manual" }] })
    expect(getSourceGenerationUpdates(db).sort()).toEqual(genuine ? ["glossary", "quiz-generation"] : [])
    expect(storyboardSourceWarnings(db)).toEqual([])
    expect(db.getStepRuns().map(run => run.step)).toContain("tts")
    for (const step of SourceGeneratorStep.options) expect(db.getAllNodeVersions(step, "book")).toHaveLength(1)
  } finally { db.close() }
  expect(provider).not.toHaveBeenCalled()
})

it.each(["current", "stale edited section", "stale untouched section", "cosmetic HTML"])("updates only proven synchronized text source (%s)", async scenario => {
  const db = storage()
  const source = structuredClone(sections)
  source.sections.push({ ...structuredClone(source.sections[0]), sectionId: "pg001_sec002", nodes: [{ nodeId: "other", role: "body_text", text: "Other text", isPruned: false }] })
  const output = structuredClone(rendering)
  output.sections.push({ sectionIndex: 1, sectionId: "pg001_sec002", sectionType: source.sections[1].sectionType, reasoning: "", html: '<section data-section-id="pg001_sec002"><p data-id="other">Other text</p></section>' })
  db.putNodeData("page-sectioning", "pg001", source); db.putNodeData("web-rendering", "pg001", output)
  publishStoryboardSource(db, "pg001", captureStoryboardSource(db, "pg001"))
  if (scenario.startsWith("stale")) {
    const index = scenario === "stale edited section" ? 0 : 1
    source.sections[index].nodes[0].text += " external change"
    putSourceNodeData(db, "page-sectioning", "pg001", source)
  }
  const baseVersion = db.getLatestNodeData("page-sectioning", "pg001")!.version
  const renderingBaseVersion = db.getLatestNodeData("web-rendering", "pg001")!.version
  db.close()
  const next = structuredClone(source)
  next.sections[0].nodes[0].text += " edited"
  output.sections[0].html = output.sections[0].html.replace("Weather", scenario === "cosmetic HTML" ? "Weather" : next.sections[0].nodes[0].text!)
  output.sections[0].html = output.sections[0].html.replace("<h1 ", '<h1 style="color:blue" ')
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), path.resolve("config.yaml"))
  const response = await app.request(`/books/${label}/pages/pg001/storyboard`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion, renderingBaseVersion, sectioning: next, rendering: output, renderingInSync: true }) })
  expect(response.status).toBe(200)
  const reopened = storage()
  try {
    expect(storyboardSourceWarnings(reopened)).toHaveLength(scenario === "current" ? 0 : 1)
    const proof = captureStoryboardSource(reopened, "pg001")!
    if (scenario === "stale untouched section") {
      expect(proof.baseline?.get("pg001_sec001")?.signature).toBe(proof.sections.get("pg001_sec001")?.signature)
      expect(proof.baseline?.get("pg001_sec002")?.signature).not.toBe(proof.sections.get("pg001_sec002")?.signature)
    }
  } finally { reopened.close() }
})

it.each([false, true])("saves pending tree work with an HTML draft (text edit=%s), without claiming rendering is in sync or generating", async genuine => {
  const { sectioningSaveFromRendering } = await import("../../../studio/src/components/pipeline/stages/storyboard/lib/back-propagate-text.js")
  const draft = { ...sections, sections: [{ ...sections.sections[0], sectionType: "activity_custom" }] }
  const html = rendering.sections[0].html.replace('<p ', '<p style="color:red" ').replace("The sky is", genuine ? "The evening sky is" : "The sky is")
  const payload = sectioningSaveFromRendering(sections, draft, 0, html, rendering.sections[0].html, true)
  const provider = vi.fn(() => { throw new Error("No generation on Save") }); vi.stubGlobal("fetch", provider)
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), path.resolve("config.yaml"))
  const db = storage(); db.markStepCompleted("web-rendering"); db.close()
  const response = await app.request(`/books/${label}/pages/pg001/storyboard`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: 1, renderingBaseVersion: 1, ...payload, rendering: { sections: [{ ...rendering.sections[0], html }] } }) })
  expect(response.status).toBe(200)
  const saved = storage()
  try {
    expect(saved.getLatestNodeData("page-sectioning", "pg001")?.data).toEqual({ ...draft, source: "manual", sections: [{ ...draft.sections[0], nodes: draft.sections[0].nodes.map(node => node.nodeId === "question" && genuine ? { ...node, text: "The evening sky is [placeholder:blue]." } : node) }] })
    expect((saved.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput).sections[0].html).toContain('style="color:red"')
    expect(saved.getStepRuns().map(run => run.step)).not.toContain("web-rendering")
    expect(saved.getAllNodeVersions("page-sectioning", "pg001")[0].data).toEqual(sections)
    expect(saved.getLatestNodeData("text-catalog-translation", "fr")?.data).toMatchObject({ entries: [{ text: "bleu manuel" }] })
  } finally { saved.close() }
  expect(provider).not.toHaveBeenCalled()
})

it.each(["storyboard", "sectioning"])("limits page-local %s Save source capture while retaining book-wide generator tracking", async endpoint => {
  const db = storage()
  db.putExtractedPage({ pageId: "pg002", pageNumber: 2, text: "Other", pageImage: { imageId: "pg002_page", buffer: Buffer.from("page2"), format: "png", hash: "fixture2", width: 100, height: 100 }, images: [] })
  db.putNodeData("page-sectioning", "pg002", { ...sections, sections: [{ ...sections.sections[0], sectionId: "pg002_sec001" }] })
  db.putNodeData("web-rendering", "pg002", { sections: [{ ...rendering.sections[0], sectionId: "pg002_sec001", html: '<section data-section-id="pg002_sec001">Other</section>' }] })
  // Generator collectors legitimately read the whole book. Disable them here
  // to measure Storyboard capture itself, rather than forbid those collectors.
  for (const step of SourceGeneratorStep.options) db.clearNodesByType([step])
  db.clearStepRuns(SourceGeneratorStep.options)
  db.close()
  const next = structuredClone(sections); next.sections[0].nodes[0].text = "New weather"
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), path.resolve("config.yaml"))
  observedReads.length = 0
  const response = await app.request(`/books/${label}/pages/pg001/${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(endpoint === "storyboard" ? { baseVersion: 1, sectioning: next } : { ...next, baseVersion: 1 }) })
  expect(response.status).toBe(200)
  expect(observedReads).toContain("pg001")
  // Three catalog reconciliation reads remain necessary; no extra before/after
  // Storyboard source capture of the unrelated page is allowed.
  expect(observedReads.filter(id => id === "pg002").length).toBeLessThanOrEqual(3)
})

it("rolls back source, HTML and source evidence if synchronized proof publication fails", async () => {
  const db = storage()
  publishStoryboardSource(db, "pg001", captureStoryboardSource(db, "pg001"))
  const fingerprint = db.getNodeVersionFingerprint()
  const attempts = db.getStepRuns()
  db.close()
  const sql = openBookDb(path.join(root, label, `${label}.db`))
  sql.exec("CREATE TRIGGER reject_synchronized_proof BEFORE INSERT ON node_data WHEN NEW.node = 'source-generation-state' AND EXISTS (SELECT 1 FROM node_data WHERE node = 'page-sectioning' AND version = 2) BEGIN SELECT RAISE(ABORT, 'forced proof failure'); END")
  sql.close()
  const next = structuredClone(sections); next.sections[0].nodes[0].text = "New weather"
  const output = structuredClone(rendering); output.sections[0].html = output.sections[0].html.replace("Weather", "New weather")
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), path.resolve("config.yaml"))
  const response = await app.request(`/books/${label}/pages/pg001/storyboard`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: 1, renderingBaseVersion: 1, sectioning: next, rendering: output, renderingInSync: true }) })
  expect(response.status).toBe(500)
  const reopened = storage()
  try {
    expect(reopened.getNodeVersionFingerprint()).toEqual(fingerprint)
    expect(reopened.getStepRuns()).toEqual(attempts)
    expect(reopened.getLatestNodeData("page-sectioning", "pg001")?.data).toEqual(sections)
    expect(reopened.getLatestNodeData("web-rendering", "pg001")?.data).toEqual(rendering)
    expect(storyboardSourceWarnings(reopened)).toEqual([])
  } finally { reopened.close() }
})
