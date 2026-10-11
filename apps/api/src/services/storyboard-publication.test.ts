import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { createBookStorage, openBookDb, writeSectioningLifecycle } from "@adt/storage"
import { getRenderSectioning } from "@adt/pipeline"
import { createStageRunner } from "./stage-runner.js"
import { reRenderPages } from "./page-edit-service.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"
import { createStageService } from "./stage-service.js"
import { createStageRoutes } from "../routes/stages.js"
import { errorHandler } from "../middleware/error-handler.js"

const render = vi.hoisted(() => vi.fn(async () => ({ sections: [] })))
vi.mock("@adt/pipeline", async (original) => ({
  ...await original<typeof import("@adt/pipeline")>(), renderPage: render,
}))

let root: string
let configPath: string
const label = "book"
const config = "structure_types: {}\nrole_types: {}\ndefault_model: ollama:llama3\npage_sectioning:\n  mode: page\n"
const fixedConfig = "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n"
const store = () => createBookStorage(label, root)
const options = () => ({ booksDir: root, promptsDir: path.resolve("prompts"), configPath, fromStage: "storyboard", toStage: "storyboard", credentials: {} })
const run = () => createStageRunner().run(label, options(), { emit() {} })
const semantic = (pageNumber: number) => ({
  reasoning: "semantic", sections: [{
    sectionId: `p${pageNumber}_sec009`, sectionType: "text", pageNumber,
    isPruned: false, nodes: [], backgroundColor: "white", textColor: "black",
  }],
})

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-publication-"))
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, config + fixedConfig)
  const s = store()
  try {
    for (const n of [2, 7]) {
      s.putExtractedPage({
        pageId: `p${n}`, pageNumber: n, text: "retained text", images: [],
        pageImage: { imageId: `p${n}_page`, buffer: Buffer.from("retained image"), hash: "test", width: 4, height: 6, format: "png" },
      })
      s.putNodeData("page-sectioning", `p${n}`, semantic(n))
    }
  } finally { s.close() }
  writeSectioningLifecycle(path.join(root, label), "page", true)
  render.mockReset().mockResolvedValue({ sections: [] })
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("Storyboard layout publication", () => {
  it("targeted fixed-layout rendering keeps the positioned renderer and leaves other pages untouched", async () => {
    const db = openBookDb(path.join(root, label, `${label}.db`))
    db.run("UPDATE images SET width = ? WHERE page_id = ?", [8, "p7"])
    db.close()
    await run()
    const before = store()
    const targetTree = before.getLatestNodeData("fixed-layout-sectioning", "p2")
    const targetRendering = before.getLatestNodeData("web-rendering", "p2")
    const other = [before.getAllNodeVersions("fixed-layout-sectioning", "p7"), before.getAllNodeVersions("web-rendering", "p7")]
    before.close()

    const [result] = await reRenderPages([{ ...options(), label, pageId: "p2" }])

    expect(render).not.toHaveBeenCalled()
    const after = store()
    try {
      expect(getRenderSectioning(after, "p2")?.sections[0].sectionType).toBe("fixed-layout-page")
      expect(after.getAllNodeVersions("fixed-layout-sectioning", "p2")).toEqual([targetTree, { ...targetTree, version: 2 }])
      expect(after.getLatestNodeData("web-rendering", "p2")).toEqual({ ...targetRendering, version: 2 })
      expect(result.version).toBe(2)
      expect(result.rendering).toEqual(targetRendering?.data)
      expect([after.getAllNodeVersions("fixed-layout-sectioning", "p7"), after.getAllNodeVersions("web-rendering", "p7")]).toEqual(other)
    } finally { after.close() }
  })

  it.each(["stage", "targeted"])("switches the active tree with %s reflowable output and retains fixed history", async (entry) => {
    await run()
    const before = store()
    const fixed = before.getLatestNodeData("fixed-layout-sectioning", "p2")
    const other = before.getLatestNodeData("web-rendering", "p7")
    expect(getRenderSectioning(before, "p2")?.sections[0].sectionType).toBe("fixed-layout-page")
    before.close()
    fs.writeFileSync(configPath, config)
    if (entry === "stage") await run()
    else await reRenderPages([{ ...options(), label, pageId: "p2" }])
    const after = store()
    try {
      expect(getRenderSectioning(after, "p2")?.reasoning).toBe("semantic")
      expect(after.getAllNodeVersions("fixed-layout-sectioning", "p2")).toContainEqual(fixed)
      expect(after.getAllNodeVersions("web-rendering", "p2")).toHaveLength(2)
      expect(after.getAllNodeVersions("page-sectioning", "p2")).toHaveLength(1)
      if (entry === "targeted") {
        expect(after.getLatestNodeData("web-rendering", "p7")).toEqual(other)
        expect(getRenderSectioning(after, "p7")?.sections[0].sectionType).toBe("fixed-layout-page")
      }
    } finally { after.close() }
  })

  it("rejects a positioned-tree edit after preflight without replacing its HTML or tree", async () => {
    await run()
    const before = store()
    const oldRendering = before.getAllNodeVersions("web-rendering", "p2")
    before.close()
    fs.writeFileSync(configPath, config)
    render.mockImplementationOnce(async () => {
      const concurrent = store()
      try { concurrent.putNodeData("fixed-layout-sectioning", "p2", { ...semantic(2), reasoning: "concurrent edit" }) }
      finally { concurrent.close() }
      return { sections: [] }
    })
    await expect(run()).rejects.toThrow(/changed after preflight/)
    const after = store()
    try {
      expect(after.getAllNodeVersions("web-rendering", "p2")).toEqual(oldRendering)
      expect(getRenderSectioning(after, "p2")?.reasoning).toBe("concurrent edit")
    } finally { after.close() }
  })

  it("requires a whole-page replacement instead of mixing positioned HTML with a semantic section", async () => {
    await run()
    const before = store()
    const oldTree = before.getAllNodeVersions("fixed-layout-sectioning", "p2")
    const oldRendering = before.getAllNodeVersions("web-rendering", "p2")
    before.close()
    fs.writeFileSync(configPath, config)
    await expect(reRenderPages([{ ...options(), label, pageId: "p2", sectionIndex: 0 }])).rejects.toThrow(/as a whole/)
    expect(render).not.toHaveBeenCalled()
    const after = store()
    try {
      expect(after.getAllNodeVersions("fixed-layout-sectioning", "p2")).toEqual(oldTree)
      expect(after.getAllNodeVersions("web-rendering", "p2")).toEqual(oldRendering)
    } finally { after.close() }
  })

  it("keeps both the positioned tree and rendering on cancellation during a layout switch", async () => {
    await run()
    const before = store()
    const oldTree = before.getAllNodeVersions("fixed-layout-sectioning", "p2")
    const oldRendering = before.getAllNodeVersions("web-rendering", "p2")
    before.close()
    fs.writeFileSync(configPath, config)
    const controller = new AbortController()
    render.mockImplementation(async () => { controller.abort(); return { sections: [] } })
    await expect(createStageRunner().run(label, { ...options(), signal: controller.signal }, { emit() {} })).rejects.toThrow()
    const after = store()
    try {
      expect(after.getAllNodeVersions("fixed-layout-sectioning", "p2")).toEqual(oldTree)
      expect(after.getAllNodeVersions("web-rendering", "p2")).toEqual(oldRendering)
    } finally { after.close() }
  })

  it("rolls back the tree switch and earlier pages when a later HTML insert fails", async () => {
    await run()
    const before = store()
    const histories = ["p2", "p7"].map((id) => [
      before.getAllNodeVersions("fixed-layout-sectioning", id),
      before.getAllNodeVersions("web-rendering", id),
    ])
    before.close()
    fs.writeFileSync(configPath, config)
    const db = openBookDb(path.join(root, label, `${label}.db`))
    db.exec("CREATE TRIGGER reject_render BEFORE INSERT ON node_data WHEN NEW.node = 'web-rendering' AND NEW.item_id = 'p7' BEGIN SELECT RAISE(ABORT, 'publication failure'); END")
    db.close()
    await expect(run()).rejects.toThrow("publication failure")
    const after = store()
    try {
      expect(["p2", "p7"].map((id) => [
        after.getAllNodeVersions("fixed-layout-sectioning", id),
        after.getAllNodeVersions("web-rendering", id),
      ])).toEqual(histories)
      for (const id of ["p2", "p7"]) expect(getRenderSectioning(after, id)?.sections[0].sectionType).toBe("fixed-layout-page")
    } finally { after.close() }
  })

  it.each(["fixed", "reflowable"])("publishes %s only inside a persisted part window", async (layout) => {
    await run()
    if (layout === "reflowable") fs.writeFileSync(configPath, config)
    const before = store()
    const outside = [before.getAllNodeVersions("web-rendering", "p2"), before.getAllNodeVersions("fixed-layout-sectioning", "p2")]
    // A malformed page outside the part is not an active preflight/render input.
    before.putNodeData("page-sectioning", "p2", null)
    before.close()
    fs.writeFileSync(path.join(root, label, "part.json"), JSON.stringify({
      adtPart: 1, sourceLabel: label, title: null, range: { startPage: 5, endPage: 10 },
      pageCount: 100, fingerprint: {}, identityHash: "id", semanticsHash: "sem",
      createdAt: "2026-01-01T00:00:00.000Z", partLabelSuggestion: "book-p005-010",
    }))
    await run()
    const after = store()
    try {
      expect([after.getAllNodeVersions("web-rendering", "p2"), after.getAllNodeVersions("fixed-layout-sectioning", "p2")]).toEqual(outside)
      expect(after.getAllNodeVersions("web-rendering", "p7")).toHaveLength(2)
      expect(getRenderSectioning(after, "p7")?.sections[0].sectionType).toBe(layout === "fixed" ? "fixed-layout-page" : "text")
    } finally { after.close() }
    expect(render).toHaveBeenCalledTimes(layout === "fixed" ? 0 : 1)
  })

  it("does not publish a partial fixed layout when a requested page has no viewport", async () => {
    fs.writeFileSync(configPath, config)
    await run()
    const before = store()
    const old = ["p2", "p7"].map((id) => before.getAllNodeVersions("web-rendering", id))
    before.close()
    const db = openBookDb(path.join(root, label, `${label}.db`))
    db.run("DELETE FROM images WHERE page_id = ?", ["p7"])
    db.close()
    fs.writeFileSync(configPath, config + fixedConfig)
    await expect(run()).rejects.toThrow(/every requested page/)
    const after = store()
    try {
      expect(["p2", "p7"].map((id) => after.getAllNodeVersions("web-rendering", id))).toEqual(old)
      expect(after.getAllNodeVersions("fixed-layout-sectioning", "p2")).toEqual([])
      expect(after.getStepRuns()).not.toContainEqual(expect.objectContaining({ step: "web-rendering", status: "done" }))
    } finally { after.close() }
  })

  it("publishes through HTTP and then executes a queued Storyboard run on the committed state", async () => {
    fs.writeFileSync(configPath, config)
    const bus = createBookEventBus()
    const completed = vi.fn()
    bus.addListener(label, (event) => { if (event.type === "stage-run-complete") completed() })
    const decisions = createPageErrorDecisions(bus)
    const service = createStageService(createStageRunner(), bus, decisions)
    const app = new Hono().onError(errorHandler).route("/", createStageRoutes(service, bus, decisions, root, path.resolve("prompts"), root, configPath))
    let finish!: () => void
    render.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ sections: [] }) }))
    const request = () => app.request(`/books/${label}/stages/run`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromStage: "storyboard", toStage: "storyboard" }),
    })
    const first = await request()
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ status: "started" })
    await vi.waitFor(() => expect(finish).toBeDefined())
    const queued = await request()
    expect(queued.status).toBe(200)
    expect(await queued.json()).toMatchObject({ status: "queued" })
    finish()
    await vi.waitFor(() => {
      expect(service.getStatus(label).queue).toHaveLength(0)
      expect(service.getStatus(label).active).toBeNull()
      expect(completed).toHaveBeenCalledTimes(2)
    }, { timeout: 10000 })
    const after = store()
    try {
      for (const id of ["p2", "p7"]) expect(after.getAllNodeVersions("web-rendering", id)).toHaveLength(2)
      expect(after.getStepRuns()).toContainEqual(expect.objectContaining({ step: "web-rendering", status: "done" }))
    } finally { after.close() }
    expect(render).toHaveBeenCalledTimes(4)
  })

  it("keeps the real CLI's existing-book fallback non-destructive", () => {
    const source = path.join(root, label, `${label}.pdf`)
    const incoming = path.join(root, "incoming.pdf")
    fs.writeFileSync(source, "retained source bytes")
    fs.copyFileSync(path.resolve("tests/fixtures/raven.pdf"), incoming)
    const before = store()
    const history = before.getAllNodeVersions("page-sectioning", "p2")
    before.close()
    const child = spawnSync(process.execPath, [path.resolve("packages/pipeline/dist/cli.js"), label, incoming, "--books-dir", root], {
      encoding: "utf8", timeout: 15000, env: { PATH: process.env.PATH },
    })
    expect(child.status, child.stderr).toBe(1)
    expect(child.stderr).toContain("EXTRACTION_LEGACY")
    expect(fs.readFileSync(source, "utf8")).toBe("retained source bytes")
    const after = store()
    try { expect(after.getAllNodeVersions("page-sectioning", "p2")).toEqual(history) }
    finally { after.close() }
  })
})
