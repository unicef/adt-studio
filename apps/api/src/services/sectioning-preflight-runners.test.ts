import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
import { runFullPipeline } from "@adt/pipeline"
import { createStageRunner } from "./stage-runner.js"
import { reRenderPages } from "./page-edit-service.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"
import { createStageService } from "./stage-service.js"
import { createStageRoutes } from "../routes/stages.js"
import { createPageRoutes } from "../routes/pages.js"
import { errorHandler } from "../middleware/error-handler.js"

const render = vi.hoisted(() => vi.fn(async () => ({ sections: [] })))
vi.mock("@adt/pipeline", async (original) => ({ ...await original<typeof import("@adt/pipeline")>(), renderPage: render }))
let root: string
let dir: string
let configPath: string
const label = "book"
const section = { sectionId: "p2_sec009", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 2, isPruned: false, nodes: [] }
const output = (n = 1) => ({ reasoning: "retained", sections: Array.from({ length: n }, () => ({ ...section })) })
function store() { return createBookStorage(label, root) }
function history() { const s = store(); try { return s.getPages().map((p) => s.getAllNodeVersions("web-rendering", p.pageId)) } finally { s.close() } }
const options = () => ({ booksDir: root, promptsDir: root, configPath, fromStage: "storyboard", toStage: "storyboard", credentials: {} })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-runners-"))
  dir = path.join(root, label)
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, 'structure_types: {}\nrole_types: {}\ndefault_model: "ollama:llama3"\npage_sectioning:\n  mode: page\n')
  const s = store()
  for (const n of [2, 7]) {
    s.putExtractedPage({ pageId: `p${n}`, pageNumber: n, text: "text", pageImage: { imageId: `p${n}_page`, buffer: Buffer.from("image"), hash: "test", width: 4, height: 6, format: "png" }, images: [] })
    s.putNodeData("page-sectioning", `p${n}`, output(n === 7 ? 2 : 1))
    s.putNodeData("web-rendering", `p${n}`, { sections: [{ html: "saved" }] })
  }
  s.close()
  writeSectioningLifecycle(dir, "page", true)
  render.mockReset()
  render.mockResolvedValue({ sections: [] })
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("production preflight boundaries", () => {
  it.each(["reflowable", "fixed"])("publishes valid By Page %s output while retaining prior versions", async (layout) => {
    const s = store(); s.putNodeData("page-sectioning", "p7", output()); s.close()
    if (layout === "fixed") fs.appendFileSync(configPath, '\ndefault_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n')
    await createStageRunner().run(label, options(), { emit() {} })
    expect(history().map((versions) => versions.length)).toEqual([2, 2])
    const saved = store()
    try {
      for (const page of ["p2", "p7"]) {
        expect(saved.getAllNodeVersions("web-rendering", page).find((row) => row.version === 1)?.data)
          .toEqual({ sections: [{ html: "saved" }] })
      }
    } finally { saved.close() }
    expect(render).toHaveBeenCalledTimes(layout === "fixed" ? 0 : 2)
  })

  it("cancellation after rendering starts publishes no partial page batch", async () => {
    const s = store(); s.putNodeData("page-sectioning", "p7", output()); s.close()
    const before = history()
    const controller = new AbortController()
    render.mockImplementation(async () => { controller.abort(); return { sections: [] } })
    await expect(createStageRunner().run(label, { ...options(), signal: controller.signal }, { emit() {} })).rejects.toThrow()
    expect(render).toHaveBeenCalled()
    expect(history()).toEqual(before)
  })

  it("honors cancellation at fixed-layout rendering admission", async () => {
    const s = store(); s.putNodeData("page-sectioning", "p7", output()); s.close()
    fs.appendFileSync(configPath, '\ndefault_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n')
    const before = history()
    const controller = new AbortController()
    await expect(createStageRunner().run(label, { ...options(), signal: controller.signal }, {
      emit(event) { if (event.type === "step-start" && event.step === "web-rendering") controller.abort() },
    })).rejects.toThrow()
    expect(history()).toEqual(before)
  })

  it.each(["reflowable", "fixed"])("rejects invalid persisted input before any %s stage renderer runs", async (layout) => {
    if (layout === "fixed") fs.appendFileSync(configPath, '\ndefault_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n')
    const before = history()
    await expect(createStageRunner().run(label, options(), { emit() {} })).rejects.toThrow(/1 page\(s\)/)
    expect(render).not.toHaveBeenCalled()
    expect(history()).toEqual(before)
  })

  it("rejects HTTP, targeted HTTP and direct targeted batch paths without touching output", async () => {
    const bus = createBookEventBus()
    const decisions = createPageErrorDecisions(bus)
    const stages = createStageService(createStageRunner(), bus, decisions)
    const app = new Hono().onError(errorHandler)
      .route("/", createStageRoutes(stages, bus, decisions, root, root, root, configPath))
      .route("/", createPageRoutes(root, root, undefined, configPath))
    const before = history()
    for (const [url, body] of [[`/books/${label}/stages/run`, { fromStage: "storyboard", toStage: "storyboard" }], [`/books/${label}/pages/p2/re-render`, {}], [`/books/${label}/pages/re-render`, { pageIds: ["p2"] }]] as const) {
      const response = await app.request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: "SECTIONING_PREFLIGHT_FAILED", total: 1, failures: [{ pageId: "p7", pageNumber: 7, reason: "multiple" }] })
    }
    await expect(reRenderPages([{ ...options(), label, pageId: "p2" }])).rejects.toThrow(/Re-run Sectioning/)
    expect(render).not.toHaveBeenCalled()
    expect(history()).toEqual(before)
  })

  it("rechecks queued input at execution time after an earlier job changes it", async () => {
    const s = store(); s.putNodeData("page-sectioning", "p7", output()); s.close()
    const bus = createBookEventBus()
    let finish!: () => void
    const called: string[] = []
    const runner = { run: vi.fn(async (_label: string, opts: { fromStage: string }) => {
      called.push(opts.fromStage)
      if (opts.fromStage === "captions") await new Promise<void>((resolve) => { finish = resolve })
    }) }
    const service = createStageService(runner, bus)
    service.startStageRun(label, { ...options(), fromStage: "captions", toStage: "captions" })
    await vi.waitFor(() => expect(finish).toBeDefined())
    expect(service.startStageRun(label, options()).status).toBe("queued")
    // Represents an update committed by the admitted earlier job.
    const changed = store(); changed.putNodeData("page-sectioning", "p7", output(2)); changed.close()
    finish()
    await vi.waitFor(() => expect(service.getStatus(label).active?.status).toBe("failed"))
    expect(called).toEqual(["captions"])
    expect(service.getStatus(label).active?.error).toContain("Re-run Sectioning")
  })

  it("blocks the unsafe existing-book CLI/DAG fallback before source replacement", async () => {
    fs.writeFileSync(path.join(dir, `${label}.pdf`), "original PDF")
    const incoming = path.join(root, "incoming.pdf"); fs.writeFileSync(incoming, "replacement")
    const before = history()
    await expect(runFullPipeline({ label, booksRoot: root, pdfPath: incoming, promptsDir: root, templatesDir: root, configPath })).rejects.toThrow(/manual or unknown-origin/)
    expect(fs.readFileSync(path.join(dir, `${label}.pdf`), "utf8")).toBe("original PDF")
    expect(history()).toEqual(before)
  })
})
