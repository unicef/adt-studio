import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { JSDOM } from "jsdom"
import { createBookStorage } from "@adt/storage"
import { captureSourceGeneration, publishSourceGeneration, getSourceGenerationUpdates } from "@adt/pipeline"
import { SourceGeneratorStep, type PageSectioningOutput, type WebRenderingOutput } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { backPropagateTextChanges } from "../../../studio/src/components/pipeline/stages/storyboard/lib/back-propagate-text.js"
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
  const response = await app.request(`/books/${label}/pages/pg001/storyboard`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rendering: { sections: [{ ...rendering.sections[0], html: editedHtml }] }, ...(edited === sections ? {} : { sectioning: edited, renderingInSync: true }) }) })
  expect(response.status).toBe(200)
  const db = storage()
  try {
    expect((db.getLatestNodeData("page-sectioning", "pg001")!.data as PageSectioningOutput).sections[0].nodes[1].text).toBe(genuine ? "The evening sky is [placeholder:blue]." : "The sky is [placeholder:blue].")
    expect(db.getAllNodeVersions("page-sectioning", "pg001")).toHaveLength(genuine ? 2 : 1)
    expect(db.getAllNodeVersions("page-sectioning", "pg001")[0].data).toEqual(sections)
    expect((db.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput).sections[0].activityAnswers).toEqual({ "item-1": "blue" })
    expect(db.getLatestNodeData("text-catalog-translation", "fr")?.data).toMatchObject({ entries: [{ id: "pg001_sec001_ans_item-1", text: "bleu manuel", source: "manual" }] })
    expect(getSourceGenerationUpdates(db).sort()).toEqual(genuine ? ["glossary", "quiz-generation"] : [])
    expect(db.getStepRuns().map(run => run.step)).toContain("tts")
    for (const step of SourceGeneratorStep.options) expect(db.getAllNodeVersions(step, "book")).toHaveLength(1)
  } finally { db.close() }
  expect(provider).not.toHaveBeenCalled()
})

it.each([false, true])("saves pending tree work with an HTML draft (text edit=%s), without claiming rendering is in sync or generating", async genuine => {
  const { sectioningSaveFromRendering } = await import("../../../studio/src/components/pipeline/stages/storyboard/lib/back-propagate-text.js")
  const draft = { ...sections, sections: [{ ...sections.sections[0], sectionType: "activity_custom" }] }
  const html = rendering.sections[0].html.replace('<p ', '<p style="color:red" ').replace("The sky is", genuine ? "The evening sky is" : "The sky is")
  const payload = sectioningSaveFromRendering(sections, draft, 0, html, rendering.sections[0].html, true)
  const provider = vi.fn(() => { throw new Error("No generation on Save") }); vi.stubGlobal("fetch", provider)
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"), path.resolve("config.yaml"))
  const db = storage(); db.markStepCompleted("web-rendering"); db.close()
  const response = await app.request(`/books/${label}/pages/pg001/storyboard`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, rendering: { sections: [{ ...rendering.sections[0], html }] } }) })
  expect(response.status).toBe(200)
  const saved = storage()
  try {
    expect(saved.getLatestNodeData("page-sectioning", "pg001")?.data).toEqual({ ...draft, sections: [{ ...draft.sections[0], nodes: draft.sections[0].nodes.map(node => node.nodeId === "question" && genuine ? { ...node, text: "The evening sky is [placeholder:blue]." } : node) }] })
    expect((saved.getLatestNodeData("web-rendering", "pg001")!.data as WebRenderingOutput).sections[0].html).toContain('style="color:red"')
    expect(saved.getStepRuns().map(run => run.step)).not.toContain("web-rendering")
    expect(saved.getAllNodeVersions("page-sectioning", "pg001")[0].data).toEqual(sections)
    expect(saved.getLatestNodeData("text-catalog-translation", "fr")?.data).toMatchObject({ entries: [{ text: "bleu manuel" }] })
  } finally { saved.close() }
  expect(provider).not.toHaveBeenCalled()
})
