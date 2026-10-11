import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PIPELINE } from "@adt/types"
import { createBookStorage, readSectioningLifecycle, writeSectioningLifecycle } from "@adt/storage"
import { assertSectioningCurrent, getRenderSectioning, loadBookConfig } from "@adt/pipeline"
import { createBookRoutes } from "../routes/books.js"
import { createStageRoutes } from "../routes/stages.js"
import { createPageRoutes } from "../routes/pages.js"
import { createAdtPreviewRoutes } from "../routes/adt-preview.js"
import { prepareExport } from "./export-service.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createStageRunner } from "./stage-runner.js"
import { createStageService } from "./stage-service.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

const { sectionPage, renderPage } = vi.hoisted(() => ({ sectionPage: vi.fn(), renderPage: vi.fn() }))
vi.mock("@adt/pipeline", async (original) => ({ ...await original<typeof import("@adt/pipeline")>(), sectionPage, renderPage }))
let root: string, dir: string, configPath: string, app: Hono
let service: ReturnType<typeof createStageService>
let bus: ReturnType<typeof createBookEventBus>
const label = "retained-book"
const store = () => createBookStorage(label, root)
const tree = (id: string, n = 1, source?: "ai" | "manual") => ({ source, reasoning: "retained", sections: Array.from({ length: n }, (_, i) => ({
  sectionId: `${id}_sec00${i + 1}`, sectionType: "text_only", pageNumber: Number(id.slice(1)),
  backgroundColor: "white", textColor: "black", isPruned: false,
  nodes: [{ nodeId: `${id}_t00${i + 1}`, text: "Retained text", role: "text", isPruned: false }],
})) })
function history(node: string, id: string) { const s = store(); try { return s.getAllNodeVersions(node, id) } finally { s.close() } }
const send = (route: string, body: unknown, method = "POST") => app.request(`/books/${label}/${route}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(route === "config" ? { config: body } : body) })
const replacement = () => ({ replaceManual: true, protectedReplacements: ["p2", "p7"].map((itemId) => ({ node: "page-sectioning", itemId, version: 1 })) })
async function run(extra = {}) {
  let result: { status: string; error?: string } | undefined
  const dispose = bus.addListener(label, (event) => {
    if (event.type === "stage-run-complete") result = { status: "completed" }
    if (event.type === "stage-run-error") result = { status: "failed", error: event.error }
  })
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "storyboard", ...extra })
  expect(response.status, await response.clone().text()).toBe(200)
  await vi.waitFor(() => expect(result).toBeDefined(), { timeout: 10_000 })
  dispose()
  return result!
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-existing-"))
  dir = path.join(root, label)
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, "default_model: ollama:llama3\nstructure_types: {}\nrole_types: {}\nconcurrency: 1\npage_sectioning:\n  mode: dynamic\n")
  const s = store()
  for (const n of [2, 7]) {
    const id = `p${n}`
    s.putExtractedPage({ pageId: id, pageNumber: n, text: "Source", images: [], pageImage: { imageId: `${id}_page`, buffer: Buffer.from("retained pixels"), format: "png", hash: "pixels", width: 4, height: 6 } })
    s.putNodeData("page-sectioning", id, tree(id, 2, n === 2 ? "manual" : undefined))
    s.putNodeData("web-rendering", id, { sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "old", html: "Retained HTML" }] })
  }
  s.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
  s.putNodeData("metadata", "book", { title: "Fixture", language_code: "en" })
  for (const stage of PIPELINE) for (const step of stage.steps) s.markStepCompleted(step.name)
  s.close()
  writeSectioningLifecycle(dir, "dynamic", true)
  sectionPage.mockReset().mockImplementation(async ({ pageId }: { pageId: string }) => tree(pageId))
  renderPage.mockReset().mockImplementation(async ({ sectioning }: { sectioning: ReturnType<typeof tree> }) => ({ sections: sectioning.sections.map((section, sectionIndex) => ({ sectionIndex, sectionType: section.sectionType, reasoning: "new", html: `<section data-section-id="${section.sectionId}">New HTML</section>` })) }))
  bus = createBookEventBus()
  const decisions = createPageErrorDecisions(bus)
  service = createStageService(createStageRunner(), bus, decisions)
  app = new Hono().onError(errorHandler)
    .route("/", createBookRoutes(root, undefined, configPath))
    .route("/", createStageRoutes(service, bus, decisions, root, path.resolve("prompts"), undefined, configPath))
    .route("/", createPageRoutes(root, path.resolve("prompts"), undefined, configPath))
    .route("/", createAdtPreviewRoutes(root, path.resolve("assets/adt"), configPath, path.resolve("prompts")))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it.each(["reflowable", "fixed", "reflowable-part", "fixed-part"])("changes mode, retains stale output, explicitly regenerates protected pages and publishes %s", async (layout) => {
  if (layout.startsWith("fixed")) fs.appendFileSync(configPath, "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
  if (layout.endsWith("part")) fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: label, title: null,
    range: { startPage: 5, endPage: 10 }, pageCount: 100, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  const before = ["p2", "p7"].map((id) => [history("page-sectioning", id), history("web-rendering", id)])
  const pixels = fs.readFileSync(path.join(dir, "images/p7_page.png"))
  expect((await send("config", { page_sectioning: { mode: "page" } }, "PUT")).status).toBe(200)
  expect(readSectioningLifecycle(dir)?.sectioningReady).toBe(false)
  expect(["p2", "p7"].map((id) => [history("page-sectioning", id), history("web-rendering", id)])).toEqual(before)
  expect((await send("stages/run", { fromStage: "storyboard", toStage: "storyboard" })).status).toBe(409)
  expect((await run()).error).toContain("explicit replacement")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(renderPage).not.toHaveBeenCalled()
  expect((await run(replacement())).status).toBe("completed")
  const s = store()
  try {
    expect(() => assertSectioningCurrent(s, loadBookConfig(label, root, configPath), dir)).not.toThrow()
    const active = layout.endsWith("part") ? ["p7"] : ["p2", "p7"]
    expect(sectionPage.mock.calls.map(([input]) => input.pageId)).toEqual(active)
    for (const id of active) {
      expect(s.getAllNodeVersions("page-sectioning", id)).toHaveLength(2)
      expect(s.getAllNodeVersions("web-rendering", id)).toHaveLength(2)
      expect(s.getLatestNodeData("page-sectioning", id)?.data).toMatchObject({ source: "ai", sections: [{ sectionId: `${id}_sec003` }] })
      expect(getRenderSectioning(s, id)?.sections).toHaveLength(1)
    }
    expect(s.getStepRuns().filter((run) => PIPELINE.find((stage) => stage.name === "extract")!.steps.some((step) => step.name === run.step)).every((run) => run.status === "done")).toBe(true)
    if (layout.endsWith("part")) expect([history("page-sectioning", "p2"), history("web-rendering", "p2")]).toEqual(before[0])
  } finally { s.close() }
  expect(fs.readFileSync(path.join(dir, "images/p7_page.png"))).toEqual(pixels)
})

it("retains compatible unknown-origin output and establishes readiness only after persisted preflight", async () => {
  const s = store(); for (const id of ["p2", "p7"]) s.putNodeData("page-sectioning", id, tree(id)); s.close()
  await send("config", { page_sectioning: { mode: "page" } }, "PUT")
  expect((await run()).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(renderPage).toHaveBeenCalledTimes(2)
  expect(history("page-sectioning", "p2")).toHaveLength(2)
  expect(readSectioningLifecycle(dir)?.sectioningReady).toBe(true)
})

it("queues Storyboard behind real protected generation and then permits a targeted rerender", async () => {
  await send("config", { page_sectioning: { mode: "page" } }, "PUT")
  let release!: () => void
  sectionPage.mockImplementationOnce(async ({ pageId }) => { await new Promise<void>((resolve) => { release = resolve }); return tree(pageId) })
  const completions: unknown[] = []
  bus.addListener(label, (event) => { if (event.type === "stage-run-complete") completions.push(event) })
  expect((await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...replacement() })).status).toBe(200)
  await vi.waitFor(() => expect(release).toBeDefined())
  const queued = await send("stages/run", { fromStage: "storyboard", toStage: "storyboard" })
  expect(await queued.json()).toMatchObject({ status: "queued" })
  expect(history("web-rendering", "p2")).toHaveLength(1)
  release()
  await vi.waitFor(() => expect(completions).toHaveLength(2), { timeout: 10_000 })
  expect((await send("pages/p2/re-render", {})).status).toBe(200)
  expect(history("web-rendering", "p2")).toHaveLength(3)
  expect(history("web-rendering", "p7")).toHaveLength(2)
})

it("does not publish a protected replacement against externally changed configuration", async () => {
  await send("config", { page_sectioning: { mode: "page" } }, "PUT")
  sectionPage.mockImplementationOnce(async ({ pageId }) => {
    fs.appendFileSync(configPath, "editing_language: fr\n")
    return tree(pageId)
  })
  const before = history("page-sectioning", "p2")
  expect((await run(replacement())).status).toBe("failed")
  expect(history("page-sectioning", "p2")).toEqual(before)
  expect(history("web-rendering", "p2")).toHaveLength(1)
  expect(readSectioningLifecycle(dir)?.sectioningReady).toBe(false)
})

it("rejects stale replacement confirmation synchronously after a previous failed run", async () => {
  await send("config", { page_sectioning: { mode: "page" } }, "PUT")
  expect((await run()).status).toBe("failed")
  const s = store()
  s.putNodeData("page-sectioning", "p2", tree("p2", 2, "manual"))
  const before = s.getStepRuns()
  s.close()
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "storyboard", ...replacement() })
  if (response.status === 200) await vi.waitFor(() => expect(service.getStatus(label).active?.status).toBe("failed"))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ currentVersion: 2 })
  expect(sectionPage).not.toHaveBeenCalled()
  const after = store()
  try { expect(after.getStepRuns()).toEqual(before) }
  finally { after.close() }
  expect(history("page-sectioning", "p2")).toHaveLength(2)
  expect(history("web-rendering", "p2")).toHaveLength(1)
})

it("keeps preview and export blocked between Sectioning completion and whole-book Storyboard publication", async () => {
  expect((await send("config", { page_sectioning: { mode: "page" } }, "PUT")).status).toBe(200)
  expect((await run({ ...replacement(), toStage: "sectioning" })).status).toBe("completed")
  expect(readSectioningLifecycle(dir)).toMatchObject({ sectioningReady: true, storyboardPending: true })
  const previewUrl = `/books/${label}/adt-preview/content/pages.json`
  expect((await app.request(previewUrl)).status).toBe(409)
  await expect(prepareExport(label, "webpub", root, path.resolve("assets/adt"), configPath)).rejects.toThrow(/Storyboard still contains retained output/)
  expect(history("web-rendering", "p2")).toHaveLength(1)
  expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
  expect(readSectioningLifecycle(dir)?.storyboardPending).toBe(false)
  expect((await app.request(previewUrl)).status).toBe(200)
})
