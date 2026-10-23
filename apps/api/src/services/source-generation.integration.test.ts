import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { getSourceGenerationUpdates, putSourceNodeData, captureSourceGeneration, publishSourceGeneration } from "@adt/pipeline"
import { createStageRunner } from "./stage-runner.js"
import { createStageRoutes, makeBeforeRun } from "../routes/stages.js"
import { createPageRoutes } from "../routes/pages.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

let root: string
let configPath: string
let promptsDir: string
const label = "retained"
const sections = { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "content", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "h", role: "heading", text: "Heading", isPruned: false }] }] }
const rendering = { sections: [{ sectionIndex: 0, sectionId: "pg001_sec001", sectionType: "content", reasoning: "", html: '<section data-section-id="pg001_sec001"><h1 data-id="h">Heading</h1><p>Body</p></section>' }] }
const storage = () => createBookStorage(label, root)
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-source-generator-api-"))
  promptsDir = path.join(root, "prompts"); fs.mkdirSync(promptsDir)
  configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, 'role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\nquiz_generation:\n  max_retries: 0\nglossary:\n  max_retries: 0\ntoc_generation:\n  max_retries: 0\n')
  for (const [name, marker] of [["quiz_generation", "QUIZ"], ["glossary", "GLOSSARY"], ["toc_generation", "TOC"]]) {
    fs.writeFileSync(path.join(promptsDir, `${name}.liquid`), `{% chat role: "user" %}${marker}\n{{ page_texts | json }}{{ pages | json }}{{ headings | json }}{% endchat %}`)
  }
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", sections)
  db.putNodeData("web-rendering", "pg001", rendering)
  db.close()
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })
const sourceNodes = { quizzes: "quiz-generation", glossary: "glossary", toc: "toc-generation" } as const
function statusApp() {
  const events = createBookEventBus()
  return createStageRoutes({ getStatus: () => ({ active: null, queue: [] }), getQueuedStages: () => [], startStageRun: () => ({ status: "started", id: "unused" }) }, events, createPageErrorDecisions(events), root, promptsDir, "", configPath)
}
function changeSource() {
  const db = storage()
  putSourceNodeData(db, "page-sectioning", "pg001", { ...sections, sections: [{ ...sections.sections[0], nodes: [{ ...sections.sections[0].nodes[0], text: "Edited heading" }] }] })
  putSourceNodeData(db, "web-rendering", "pg001", { sections: [{ ...rendering.sections[0], html: rendering.sections[0].html.replace("Body", "Edited body") }] })
  db.close()
}
it.each(["quizzes", "glossary", "toc"] as const)("%s retains content and update warning on failed/cancelled retry, clearing only after successful publication", async stage => {
  let fail = false
  let abort: AbortController | undefined
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
    abort?.abort()
    if (fail) return Response.json({ error: { message: "invalid provider credentials" } }, { status: 401 })
    const object = stage === "quizzes"
      ? { reasoning: "", question: "Which word?", options: ["A", "B", "C"].map(text => ({ text, explanation: text })), answer_index: 0 }
      : stage === "glossary" ? { reasoning: "", items: [{ word: "Body", definition: "Text", variations: [], emojis: [] }] }
      : { reasoning: "", entries: [{ title: "Heading", sectionId: "pg001_sec001", level: 1 }] }
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
  const run = () => createStageRunner().run(label, { booksDir: root, promptsDir, configPath, fromStage: stage, toStage: stage, signal: abort?.signal }, { emit() {} })
  await run()
  expect(transport).toHaveBeenCalledTimes(1)
  const first = storage(); const retained = first.getLatestNodeData(sourceNodes[stage], "book"); first.close()
  expect(retained).toBeTruthy()
  changeSource()
  expect(transport).toHaveBeenCalledTimes(1)
  const app = statusApp()
  expect((await (await app.request(`/books/${label}/step-status`)).json()).sourceUpdateStages).toContain(stage)
  makeBeforeRun(label, stage, stage, root)()
  const prepared = storage(); expect(prepared.getLatestNodeData(sourceNodes[stage], "book")).toEqual(retained); prepared.close()
  fail = true
  await expect(run()).rejects.toThrow()
  expect(transport).toHaveBeenCalledTimes(2)
  expect((await (await app.request(`/books/${label}/step-status`)).json()).sourceUpdateStages).toContain(stage)
  fail = false; abort = new AbortController()
  await expect(run()).rejects.toThrow()
  expect(transport).toHaveBeenCalledTimes(3)
  const cancelled = storage(); expect(cancelled.getLatestNodeData(sourceNodes[stage], "book")).toEqual(retained); expect(getSourceGenerationUpdates(cancelled)).toContain(sourceNodes[stage]); cancelled.close()
  abort = undefined
  await run()
  const done = storage()
  expect(done.getLatestNodeData(sourceNodes[stage], "book")!.version).toBeGreaterThan(retained!.version)
  expect(done.getAllNodeVersions(sourceNodes[stage], "book")[0]).toEqual(retained)
  expect(getSourceGenerationUpdates(done)).not.toContain(sourceNodes[stage]); done.close()
  expect((await (await app.request(`/books/${label}/step-status`)).json()).sourceUpdateStages).not.toContain(stage)
})

it("preparing a Storyboard-only run retains source and all three generators without declaring unchanged inputs outdated", () => {
  const db = storage()
  const before = ["page-sectioning", "web-rendering", ...Object.values(sourceNodes)].map(node => {
    if (Object.values(sourceNodes).includes(node as never)) { db.putNodeData(node, "book", { retained: true }); db.markStepCompleted(node) }
    return [node, db.getLatestNodeData(node, node.includes("sectioning") || node === "web-rendering" ? "pg001" : "book")] as const
  })
  db.close()
  makeBeforeRun(label, "storyboard", "storyboard", root)()
  const after = storage()
  for (const [node, value] of before) expect(after.getLatestNodeData(node, node.includes("sectioning") || node === "web-rendering" ? "pg001" : "book")).toEqual(value)
  expect(after.getStepRuns().map(run => run.step)).toEqual(expect.arrayContaining(Object.values(sourceNodes)))
  expect(getSourceGenerationUpdates(after)).toEqual([])
  after.close()
})

it("does not warn on no-op output restore, but warns after selecting an older generator version", async () => {
  const db = storage()
  db.putNodeData("toc-generation", "book", { entries: [], generatedAt: "old", pageCount: 1 })
  db.putNodeData("toc-generation", "book", { entries: [], generatedAt: "new", pageCount: 1 })
  db.close()
  const app = createPageRoutes(root, promptsDir, "", configPath)
  const restore = (version: number) => app.request(`/books/${label}/versions/toc-generation/book/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) })
  expect((await restore(2)).status).toBe(200)
  const same = storage(); expect(getSourceGenerationUpdates(same)).toEqual([]); same.close()
  expect((await restore(1)).status).toBe(200)
  const older = storage(); expect(getSourceGenerationUpdates(older)).toEqual(["toc-generation"]); older.close()
})


it("generates only eligible Quiz pages even when an excluded page has malformed retained HTML", async () => {
  fs.writeFileSync(configPath, "role_types: {}\nstructure_types: {}\ndefault_model: ollama:tinyllama\nquiz_generation:\n  max_retries: 0\n  pages_per_quiz: 1\n  quiz_section_types: [content]\n")
  const db = storage()
  db.putExtractedPage({ pageId: "pg002", pageNumber: 2, text: "excluded", pageImage: { imageId: "pg002_page", buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
  db.putNodeData("page-sectioning", "pg002", { ...sections, sections: [{ ...sections.sections[0], sectionId: "pg002_sec001", sectionType: "excluded" }] })
  db.putNodeData("web-rendering", "pg002", { invalid: "excluded rendering" }); db.close()
  const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    expect(String(init?.body)).toContain("Body")
    expect(String(init?.body)).not.toContain("excluded rendering")
    const object = { reasoning: "", question: "Which word?", options: ["A", "B", "C"].map(text => ({ text, explanation: text })), answer_index: 0 }
    return Response.json({ id: "test", object: "chat.completion", created: 0, model: "test", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  })
  vi.stubGlobal("fetch", transport)
  await createStageRunner().run(label, { booksDir: root, promptsDir, configPath, fromStage: "quizzes", toStage: "quizzes" }, { emit() {} })
  expect(transport).toHaveBeenCalledTimes(1)
  const done = storage()
  expect(done.getLatestNodeData("quiz-generation", "book")?.data).toMatchObject({ quizzes: [{ pageIds: ["pg001"] }] })
  expect(done.getLatestNodeData("web-rendering", "pg002")?.data).toEqual({ invalid: "excluded rendering" })
  expect(getSourceGenerationUpdates(done)).toEqual([]); done.close()
})
it("keeps retained content as current through the API, restoring completion, and warns again after the next source change", async () => {
  const app = statusApp()
  expect((await app.request(`/books/${label}/source-generation/glossary/keep`, { method: "POST" })).status).toBe(409)
  expect((await app.request(`/books/${label}/source-generation/speech/keep`, { method: "POST" })).status).toBe(400)
  const seed = storage()
  publishSourceGeneration(seed, captureSourceGeneration(seed, "glossary"), () => seed.putNodeData("glossary", "book", { items: [] }))
  seed.markStepCompleted("glossary")
  seed.close()
  changeSource()
  const status = async () => (await app.request(`/books/${label}/step-status`)).json() as Promise<{ sourceUpdateStages: string[]; stages: Record<string, string> }>
  expect(await status()).toMatchObject({ sourceUpdateStages: ["glossary"], stages: expect.objectContaining({ glossary: "idle" }) })
  expect((await app.request(`/books/${label}/source-generation/glossary/keep`, { method: "POST" })).status).toBe(200)
  expect(await status()).toMatchObject({ sourceUpdateStages: [], stages: expect.objectContaining({ glossary: "done" }) })
  const kept = storage()
  expect(kept.getAllNodeVersions("glossary", "book").map(row => row.data)).toEqual([{ items: [] }])
  putSourceNodeData(kept, "web-rendering", "pg001", { sections: [{ ...rendering.sections[0], html: rendering.sections[0].html.replace("Body", "Edited twice") }] })
  kept.close()
  expect(await status()).toMatchObject({ sourceUpdateStages: ["glossary"], stages: expect.objectContaining({ glossary: "idle" }) })
})
