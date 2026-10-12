import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, readSectioningLifecycle, writeSectioningLifecycle } from "@adt/storage"
import { extractPDF, getRenderSectioning } from "@adt/pipeline"
import { createPageRoutes } from "../routes/pages.js"
import { createStageRoutes } from "../routes/stages.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createStageRunner } from "./stage-runner.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createTaskService } from "./task-service.js"
import { createStageService } from "./stage-service.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

const repository = path.resolve(import.meta.dirname, "../../../..")
const label = "fixed-book"
let root: string, dir: string, configPath: string
let transport: ReturnType<typeof vi.spyOn>
const store = () => createBookStorage(label, root)
const history = () => {
  const s = store()
  try {
    return ["pg001", "pg002"].map((pageId) => Object.fromEntries(
      ["page-sectioning", "fixed-layout-sectioning", "web-rendering"].map((node) => [node, s.getAllNodeVersions(node, pageId)]),
    ))
  } finally { s.close() }
}
const semantic = (page: number) => ({ reasoning: "retained", source: "manual", sections: [{
  sectionId: `pg00${page}_sec009`, sectionType: "text_only", pageNumber: page,
  backgroundColor: "white", textColor: "black", isPruned: false,
  nodes: [{ nodeId: `pg00${page}_t001`, text: "Manual text", role: "text", isPruned: false }],
}] })
const request = (app: Hono, suffix: string, body = {}) => app.request(`/books/${label}/pages/${suffix}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})
function routes(tasks?: ReturnType<typeof createTaskService>) {
  return new Hono().onError(errorHandler).route("/", createPageRoutes(root, path.join(repository, "prompts"), "", configPath, tasks))
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "targeted-fixed-"))
  dir = path.join(root, label)
  configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\npage_sectioning:\n  mode: page\ndefault_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
  transport = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider call"))
  const s = store()
  try {
    await extractPDF({ pdfPath: path.join(repository, "tests/fixtures/raven.pdf"), startPage: 1, endPage: 2, fixedLayout: true }, s, { emit() {} })
    for (const n of [1, 2]) {
      s.putNodeData("page-sectioning", `pg00${n}`, semantic(n))
      s.putNodeData("image-filtering", `pg00${n}`, { images: s.getPageImages(`pg00${n}`).map((image) => ({ imageId: image.imageId, isPruned: image.imageId.endsWith("_page") })) })
    }
  } finally { s.close() }
  writeSectioningLifecycle(dir, "page", true)
  await createStageRunner().run(label, { booksDir: root, configPath, promptsDir: path.join(repository, "prompts"), credentials: {}, fromStage: "storyboard", toStage: "storyboard" }, { emit() {} })
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

it.each([false, true])("publishes an actual targeted fixed page through HTTP (background task: %s) without provider calls", async (background) => {
  const before = history()
  const tasks = background ? createTaskService(createBookEventBus(), root) : undefined
  const response = await request(routes(tasks), "pg001/re-render")
  expect(response.status, await response.clone().text()).toBe(200)
  if (tasks) await vi.waitFor(() => expect(tasks.getActiveTasks(label)[0]?.status).toBe("completed"))
  else expect(await response.json()).toMatchObject({ version: 2 })
  const after = history()
  expect(after[1]).toEqual(before[1])
  expect(after[0]["page-sectioning"]).toEqual(before[0]["page-sectioning"])
  for (const node of ["fixed-layout-sectioning", "web-rendering"]) {
    expect(after[0][node]).toEqual([before[0][node][0], { ...before[0][node][0], version: 2 }])
  }
  const s = store()
  try { expect(getRenderSectioning(s, "pg001")?.sections[0].sectionType).toBe("fixed-layout-page") }
  finally { s.close() }
  expect(transport).not.toHaveBeenCalled()
})

it("runs fixed Storyboard through HTTP without requiring the unused LLM or visual refinement", async () => {
  fs.appendFileSync(configPath, "  unused:\n    render_type: llm\n    config:\n      visual_refinement:\n        enabled: true\n")
  const bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  const service = createStageService(createStageRunner(), bus, decisions)
  let completed = false
  bus.addListener(label, (event) => { if (event.type === "stage-run-complete") completed = true })
  const app = new Hono().onError(errorHandler).route("/", createStageRoutes(service, bus, decisions, root, path.join(repository, "prompts"), path.join(repository, "assets/adt"), configPath))
  const send = (fromStage: string) => app.request(`/books/${label}/stages/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromStage, toStage: "storyboard" }) })
  expect((await send("sectioning")).status).toBe(400)
  expect((await send("storyboard")).status).toBe(200)
  await vi.waitFor(() => expect(completed).toBe(true))
  expect(history()[0]["web-rendering"]).toHaveLength(2)
  expect(transport).not.toHaveBeenCalled()
})

it("targeted publication ignores historical lifecycle flags and retains unrelated pages", async () => {
  writeSectioningLifecycle(dir, "page", true, true)
  const app = routes()
  expect((await request(app, "pg001/re-render")).status).toBe(200)
  expect(readSectioningLifecycle(dir)?.storyboardPending).toBe(true)
  expect((await request(app, "re-render", { pageIds: ["pg001", "pg002"] })).status).toBe(200)
  expect(readSectioningLifecycle(dir)?.storyboardPending).toBe(true)
  expect(transport).not.toHaveBeenCalled()
})

it("manual section counts on an unselected page do not block targeted fixed rendering", async () => {
  const s = store()
  const invalid = semantic(2)
  invalid.sections.push({ ...invalid.sections[0], sectionId: "pg002_sec010" })
  s.putNodeData("page-sectioning", "pg002", invalid)
  s.close()
  const before = history()
  const response = await request(routes(), "pg001/re-render")
  expect(response.status).toBe(200)
  expect(history()[1]).toEqual(before[1])
  expect(history()[0]["web-rendering"]).toHaveLength(2)
  expect(transport).not.toHaveBeenCalled()
})

it.each([
  { suffix: "pg001/re-render?sectionIndex=0", body: {} },
  { suffix: "pg001/re-render", body: { prompt: "Rewrite the page" } },
])("rejects unsupported fixed-layout instructions without replacing output: $suffix $body", async ({ suffix, body }) => {
  const before = history()
  const response = await request(routes(), suffix, body)
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "STORYBOARD_INPUT_CHANGED" })
  expect(history()).toEqual(before)
  expect(transport).not.toHaveBeenCalled()
})

it("uses the active part window for targeted fixed publication and retains the outside page", async () => {
  fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null,
    range: { startPage: 2, endPage: 2 }, pageCount: 3, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  const s = store(); s.putNodeData("page-sectioning", "pg001", null); s.close()
  writeSectioningLifecycle(dir, "page", true, true)
  const before = history()
  expect((await request(routes(), "pg002/re-render")).status).toBe(200)
  expect(history()[0]).toEqual(before[0])
  expect(history()[1]["web-rendering"]).toHaveLength(2)
  expect(readSectioningLifecycle(dir)?.storyboardPending).toBe(true)
  expect(transport).not.toHaveBeenCalled()
})
