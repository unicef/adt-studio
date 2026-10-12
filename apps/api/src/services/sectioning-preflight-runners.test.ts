import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
import { runFullPipeline, outputEvidence } from "@adt/pipeline"
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
const output = (n = 1, pageId = "p2") => ({ reasoning: "retained", sections: Array.from({ length: n }, (_, index) => ({ ...section, sectionId: `${pageId}_sec00${index + 1}` })) })
function store() { return createBookStorage(label, root) }
function history() { const s = store(); try { return s.getPages().map((p) => s.getAllNodeVersions("web-rendering", p.pageId)) } finally { s.close() } }
const options = () => ({ booksDir: root, promptsDir: root, configPath, fromStage: "storyboard", toStage: "storyboard", credentials: {} })
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-runners-"))
  dir = path.join(root, label)
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, 'structure_types: {}\nrole_types: {}\ndefault_model: "ollama:llama3"\nconcurrency: 1\npage_sectioning:\n  mode: page\n')
  const s = store()
  for (const n of [2, 7]) {
    s.putExtractedPage({ pageId: `p${n}`, pageNumber: n, text: "text", pageImage: { imageId: `p${n}_page`, buffer: Buffer.from("image"), hash: "test", width: 4, height: 6, format: "png" }, images: [] })
    s.putNodeData("page-sectioning", `p${n}`, output(n === 7 ? 2 : 1, `p${n}`))
    s.putNodeData("web-rendering", `p${n}`, { ...rendered({ sectioning: output(n === 7 ? 2 : 1, `p${n}`) }), generationEvidence: { source: "ai", input: outputEvidence("old-input", { html: rendered({ sectioning: output(n === 7 ? 2 : 1, `p${n}`) }) }) } })
  }
  s.close()
  writeSectioningLifecycle(dir, "page", true)
  render.mockReset()
  render.mockResolvedValue({ sections: [] })
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function rendered(input: { sectioning: ReturnType<typeof output> }) {
  return { sections: input.sectioning.sections.map((section, sectionIndex) => ({ sectionId: section.sectionId, sectionIndex, sectionType: section.sectionType, reasoning: "fixture", html: `<section data-section-id="${section.sectionId}">Current output</section>` })) }
}
function app() { return new Hono().onError(errorHandler).route("/", createPageRoutes(root, root, undefined, configPath)) }

describe("revised saved-content and per-page publication boundaries", () => {
  it.each(["first generation", "same-layout rerun"])("an early page is available through the real page API during a slow second page: %s", async (kind) => {
    if (kind === "first generation") { const s = store(); for (const id of ["p2", "p7"]) s.putNodeData("web-rendering", id, null); s.close() }
    let finish!: () => void
    render.mockImplementation(async (input) => {
      if (input.pageId === "p7") await new Promise<void>((resolve) => { finish = resolve })
      return rendered(input)
    })
    const running = createStageRunner().run(label, options(), { emit() {} })
    try {
      await vi.waitFor(() => expect(finish).toBeDefined())
      const response = await app().request(`/books/${label}/pages`)
      expect(response.status).toBe(200)
      const pages = await response.json()
      expect(pages.find((p: { pageId: string }) => p.pageId === "p2")).toMatchObject({ hasRendering: true })
      const row = store(); try { expect(row.getLatestNodeData("web-rendering", "p2")?.data).toMatchObject({ ...rendered({ sectioning: output(1) }), generationEvidence: { source: "ai" } }) } finally { row.close() }
    } finally { finish?.(); await running }
    expect(render).toHaveBeenCalledTimes(2)
  })

  it.each(["failure", "skip", "cancel"])("a later %s retains both the successfully published page and the failed page's old output", async (outcome) => {
    const before = history()
    const controller = new AbortController()
    render.mockImplementation(async (input) => {
      if (input.pageId === "p7") { if (outcome === "cancel") controller.abort(); throw new Error("second page unavailable") }
      return rendered(input)
    })
    const running = createStageRunner().run(label, { ...options(), signal: controller.signal,
      ...(outcome === "skip" ? { pageErrorPolicy: "ask" as const, requestPageDecision: async () => "skip" as const } : {}),
    }, { emit() {} })
    if (outcome === "skip") await expect(running).rejects.toMatchObject({ code: "RESUME_INCOMPLETE" })
    else await expect(running).rejects.toThrow()
    expect(history()[0]).toHaveLength(before[0].length + 1)
    expect(history()[1]).toEqual(before[1])
  })

  it("manual counts do not block immediate or batched targeted HTTP rendering of another page", async () => {
    render.mockImplementation(async (input) => rendered(input))
    const before = history()[1]
    for (const [suffix, body] of [["p2/re-render", {}], ["re-render", { pageIds: ["p2"] }]] as const) {
      const response = await app().request(`/books/${label}/pages/${suffix}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      expect(response.status, await response.clone().text()).toBe(200)
    }
    expect(history()[1]).toEqual(before)
    await reRenderPages([{ ...options(), label, pageId: "p2" }])
    expect(render).toHaveBeenCalledTimes(3)
  })

  it("a targeted layout switch refuses a subset before provider calls", async () => {
    fs.appendFileSync(configPath, '\ndefault_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n')
    const before = history()
    await expect(reRenderPages([{ ...options(), label, pageId: "p2" }])).rejects.toThrow("STORYBOARD_PUBLICATION_INCOMPLETE")
    expect(history()).toEqual(before)
    expect(render).not.toHaveBeenCalled()
  })

  it("returns the actual committed version after restoring an older output", async () => {
    const s = store()
    s.putNodeData("web-rendering", "p2", { sections: [] })
    s.putNodeData("web-rendering", "p2", { sections: [] })
    s.setCurrentNodeVersion("web-rendering", "p2", 1)
    s.close()
    render.mockImplementation(async (input) => rendered(input))
    const [result] = await reRenderPages([{ ...options(), label, pageId: "p2" }])
    expect(result.version).toBe(4)
    const check = store(); try { expect(check.getLatestNodeData("web-rendering", "p2")?.version).toBe(result.version) } finally { check.close() }
  })

  it("blocks unsafe existing-book CLI/DAG fallback before source replacement", async () => {
    fs.writeFileSync(path.join(dir, `${label}.pdf`), "original PDF")
    const incoming = path.join(root, "incoming.pdf"); fs.copyFileSync(path.resolve("tests/fixtures/raven.pdf"), incoming)
    const before = history()
    await expect(runFullPipeline({ label, booksRoot: root, pdfPath: incoming, promptsDir: root, templatesDir: root, configPath })).rejects.toThrow(/EXTRACTION_LEGACY/)
    expect(fs.readFileSync(path.join(dir, `${label}.pdf`), "utf8")).toBe("original PDF")
    expect(history()).toEqual(before)
  })
})
