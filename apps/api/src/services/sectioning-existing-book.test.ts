import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PIPELINE } from "@adt/types"
import { createBookStorage, openBookDb, readSectioningLifecycle, writeSectioningLifecycle } from "@adt/storage"
import { storyboardCoverage, getRenderSectioning, loadBookConfig } from "@adt/pipeline"
import { createBookRoutes } from "../routes/books.js"
import { createStageRoutes } from "../routes/stages.js"
import { createPageRoutes } from "../routes/pages.js"
import { createPackageRoutes } from "../routes/package.js"
import { createAdtPreviewRoutes } from "../routes/adt-preview.js"
import { prepareExport } from "./export-service.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createStageRunner } from "./stage-runner.js"
import { createTaskService } from "./task-service.js"
import { createStageService } from "./stage-service.js"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

const { sectionPage, renderPage } = vi.hoisted(() => ({ sectionPage: vi.fn(), renderPage: vi.fn() }))
vi.mock("@adt/pipeline", async (original) => ({ ...await original<typeof import("@adt/pipeline")>(), sectionPage, renderPage }))
// Pause at an actual cooperative scheduling boundary, never inside a
// publication callback: real HTTP reads/cancellation must run during the pause.
const scheduling = vi.hoisted(() => ({ afterFirstPage: false, release: undefined as (() => void) | undefined }))
vi.mock("node:timers/promises", async (original) => {
  const timers = await original<typeof import("node:timers/promises")>()
  return { ...timers, setImmediate: async (...args: Parameters<typeof timers.setImmediate>) => {
    await timers.setImmediate(...args)
    if (scheduling.afterFirstPage && !scheduling.release) await new Promise<void>(resolve => { scheduling.release = resolve })
  } }
})
let root: string, dir: string, configPath: string, app: Hono
let service: ReturnType<typeof createStageService>
let bus: ReturnType<typeof createBookEventBus>
const label = "retained-book"
const store = () => createBookStorage(label, root)
const tree = (id: string, n = 1, source?: "ai" | "manual") => ({ source, reasoning: "retained", sections: Array.from({ length: n }, (_, i) => ({
  sectionId: `${id}_sec00${i + 1}`, sectionType: "text_only", pageNumber: Number(id.slice(1)),
  backgroundColor: "white", textColor: "black", isPruned: false,
  nodes: [1, 2].map((n) => ({ nodeId: `${id}_t${i}${n}`, text: `Retained text ${n}`, role: "text", isPruned: false })),
})) })
function history(node: string, id: string) { const s = store(); try { return s.getAllNodeVersions(node, id) } finally { s.close() } }
const send = (route: string, body: unknown, method = "POST") => app.request(`/books/${label}/${route}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(route === "config" ? { config: body } : body) })
async function replacement(ids?: string[]) {
  const response = await app.request(`/books/${label}/step-status`)
  expect(response.status).toBe(200)
  const { protectedWork } = await response.json()
  return { replaceManual: true, protectedReplacements: protectedWork.filter((record: { node: string; itemId: string }) => record.node === "page-sectioning" && (!ids || ids.includes(record.itemId))).map(({ pageNumber: _, ...record }: Record<string, unknown>) => record) }
}
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
    s.putNodeData("positioned-text", id, { drawItems: [], pageWidth: 4, pageHeight: 6, renderWidth: 8, renderHeight: 12 })
    s.putNodeData("image-filtering", id, { images: [] })
    s.putNodeData("web-rendering", id, { sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "old", sectionId: `${id}_sec001`, html: `<section data-section-id="${id}_sec001">Retained HTML</section>` }] })
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
    .route("/", createPackageRoutes(root, path.resolve("assets/adt"), configPath))
    .route("/", createStageRoutes(service, bus, decisions, root, root, undefined, configPath))
    .route("/", createPageRoutes(root, root, undefined, configPath))
    .route("/", createAdtPreviewRoutes(root, path.resolve("assets/adt"), configPath, path.resolve("prompts")))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

// Original AC-18/19 mode gates and retained-current HTML were superseded by
// the authorized October review. These cases exercise their revised outcomes.
it.each(["reflowable", "fixed", "reflowable-part", "fixed-part"].flatMap((layout) => ["page", "dynamic"].map((mode) => ({ layout, mode }))))("mode preference, missing-only run, explicit reset and publication through HTTP: $layout → $mode", async ({ layout, mode }) => {
  if (mode === "dynamic") { fs.writeFileSync(path.join(dir, "config.yaml"), "page_sectioning:\n  mode: page\n"); writeSectioningLifecycle(dir, "page", true) }
  if (layout.startsWith("fixed")) fs.appendFileSync(configPath, "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
  if (layout.endsWith("part")) fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: label, title: null,
    range: { startPage: 5, endPage: 10 }, pageCount: 100, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  const active = layout.endsWith("part") ? ["p7"] : ["p2", "p7"]
  const before = ["p2", "p7"].map((id) => [history("page-sectioning", id), history("web-rendering", id)])
  const pixels = fs.readFileSync(path.join(dir, "images/p7_page.png"))
  expect((await send("config", { page_sectioning: { mode } }, "PUT")).status).toBe(200)
  expect(["p2", "p7"].map((id) => [history("page-sectioning", id), history("web-rendering", id)])).toEqual(before)
  expect((await run({ toStage: "sectioning" })).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(["p2", "p7"].map((id) => [history("page-sectioning", id), history("web-rendering", id)])).toEqual(before)
  const consent = await replacement()
  expect(consent.protectedReplacements.map((r: { itemId: string }) => r.itemId)).toEqual(active)
  expect((await run({ ...consent, toStage: "sectioning" })).status).toBe("completed")
  let s = store()
  try {
    for (const id of active) {
      expect(s.getLatestNodeData("web-rendering", id)?.data).toBeNull()
      expect(s.getAllNodeVersions("web-rendering", id)).toHaveLength(2)
      expect(s.getLatestNodeData("page-sectioning", id)?.data).toMatchObject({ source: "ai", sections: [{ sectionId: `${id}_sec003` }] })
    }
    expect(storyboardCoverage(s, active).complete).toBe(false)
  } finally { s.close() }
  const target = active[0]
  const split = await send(`pages/${target}/sections/0/split`, { baseVersion: 2, beforeNodeIndex: 1 })
  expect(split.status, await split.clone().text()).toBe(200)
  expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
  s = store()
  try {
    expect(storyboardCoverage(s, active).complete).toBe(true)
    expect((s.getLatestNodeData("page-sectioning", target)?.data as ReturnType<typeof tree>).sections).toHaveLength(2)
    // Fixed layout deliberately keeps its positioned rendering architecture;
    // arbitrary semantic counts are accepted but do not replace PDF geometry.
    expect(getRenderSectioning(s, target)?.sections).toHaveLength(layout.startsWith("fixed") ? 1 : 2)
    for (const id of active) expect(s.getAllNodeVersions("web-rendering", id)).toHaveLength(3)
  } finally { s.close() }
  if (layout.endsWith("part")) expect([history("page-sectioning", "p2"), history("web-rendering", "p2")]).toEqual(before[0])
  expect(fs.readFileSync(path.join(dir, "images/p7_page.png"))).toEqual(pixels)
})

it("older books render intentional By Page edits without lifecycle initialization", async () => {
  fs.rmSync(path.join(dir, ".sectioning-lifecycle.json"))
  fs.appendFileSync(configPath, "# inherited preference\n")
  await send("config", { page_sectioning: { mode: "page" } }, "PUT")
  fs.rmSync(path.join(dir, ".sectioning-lifecycle.json"))
  expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(renderPage).toHaveBeenCalledTimes(2)
  expect(history("page-sectioning", "p2")).toHaveLength(1)
  expect(readSectioningLifecycle(dir)).toBeNull()
  expect((await app.request(`/books/${label}/adt-preview/content/pages.json`)).status).toBe(200)
})

it("queues Storyboard behind explicit reset and then permits a targeted rerender", async () => {
  let release!: () => void
  sectionPage.mockImplementationOnce(async ({ pageId }) => { await new Promise<void>((resolve) => { release = resolve }); return tree(pageId) })
  const completions: unknown[] = []
  bus.addListener(label, (event) => { if (event.type === "stage-run-complete") completions.push(event) })
  expect((await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...await replacement() })).status).toBe(200)
  await vi.waitFor(() => expect(release).toBeDefined())
  const queued = await send("stages/run", { fromStage: "storyboard", toStage: "storyboard" })
  expect(await queued.json()).toMatchObject({ status: "queued" })
  expect(history("web-rendering", "p2")).toHaveLength(2)
  expect(history("web-rendering", "p2")[1].data).toBeNull()
  release()
  await vi.waitFor(() => expect(completions).toHaveLength(2), { timeout: 10_000 })
  expect((await send("pages/p2/re-render", {})).status).toBe(200)
  expect(history("web-rendering", "p2")).toHaveLength(4)
  expect(history("web-rendering", "p7")).toHaveLength(3)
})

it("configuration edits during generation retain authored Sectioning and the committed reset", async () => {
  sectionPage.mockImplementationOnce(async ({ pageId }) => { fs.appendFileSync(configPath, "editing_language: fr\n"); return tree(pageId) })
  const before = history("page-sectioning", "p2")
  expect((await run(await replacement())).status).toBe("failed")
  expect(history("page-sectioning", "p2")).toEqual(before)
  expect(history("web-rendering", "p2")).toHaveLength(2)
  expect(history("web-rendering", "p2")[1].data).toBeNull()
})

it.each(["global config", "book config", "persisted window", "missing receipt"])("rejects replacement consent after changed %s without altering content", async (change) => {
  const consent = await replacement()
  const before = ["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])
  const pixels = fs.readFileSync(path.join(dir, "images/p7_page.png"))
  if (change === "global config") fs.appendFileSync(configPath, "editing_language: fr\n")
  if (change === "book config") expect((await send("config", { page_sectioning: { mode: "page" } }, "PUT")).status).toBe(200)
  // Same extracted page membership: a range change itself invalidates consent.
  if (change === "persisted window") fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: label, title: null,
    range: { startPage: 1, endPage: 10 }, pageCount: 100, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  if (change === "missing receipt") for (const record of consent.protectedReplacements) delete record.sectioningInputSignature
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", pageErrorPolicy: "stop", ...consent })
  // Let a wrongly admitted baseline run settle before disposing its real DB.
  await vi.waitFor(() => expect(service.getStatus(label).active).toBeNull(), { timeout: 10_000 })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "REPLACEMENT_CONFIRMATION_INVALID" })
  expect(sectionPage).not.toHaveBeenCalled()
  expect(["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])).toEqual(before)
  expect(fs.readFileSync(path.join(dir, "images/p7_page.png"))).toEqual(pixels)
})

it.each(["page-sectioning", "web-rendering", "fixed-layout-sectioning"])("rejects stale %s confirmation before reset or provider work", async (node) => {
  const consent = await replacement()
  const s = store()
  s.putNodeData(node, "p2", tree("p2", 2, "manual"))
  const before = s.getStepRuns()
  s.close()
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "storyboard", ...consent })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "VERSION_CONFLICT" })
  expect(sectionPage).not.toHaveBeenCalled()
  const after = store()
  try { expect(after.getStepRuns()).toEqual(before) } finally { after.close() }
})

it.each([null, "null", "{broken json", JSON.stringify({ sections: "invalid" })])("ordinary Sectioning retains unreadable current records and Storyboard skips only that page: %s", async (raw) => {
  const db = openBookDb(path.join(dir, `${label}.db`))
  db.run("UPDATE node_data SET data = ? WHERE node = 'page-sectioning' AND item_id = 'p2'", [raw])
  db.close()
  expect((await run({ toStage: "sectioning" })).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
  expect(renderPage.mock.calls.map(([input]) => input.pageId)).toEqual(["p7"])
  const status = await (await app.request(`/books/${label}/step-status`)).json()
  expect(status.coverage).toMatchObject({ complete: false, missingPages: ["p2"] })
  expect(status.stages.storyboard).not.toBe("done")
  const check = openBookDb(path.join(dir, `${label}.db`))
  expect(check.get("SELECT data FROM node_data WHERE node = 'page-sectioning' AND item_id = 'p2'")).toEqual({ data: raw })
  check.close()
})

it("partial section rendering stays usable but incomplete across page, library, stage and export disclosure", async () => {
  const s = store(); s.putNodeData("web-rendering", "p2", null); s.close()
  const result = await app.request(`/books/${label}/pages/p2/re-render?sectionIndex=0`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  expect(result.status, await result.clone().text()).toBe(200)
  const status = await (await app.request(`/books/${label}/step-status`)).json()
  expect(status.coverage.complete).toBe(false)
  expect(status.stages.storyboard).not.toBe("done")
  const detail = await (await app.request(`/books/${label}`)).json()
  expect(detail.completedStages).not.toContain("storyboard")
  const preview = await app.request(`/books/${label}/adt-preview/content/pages.json`)
  expect(preview.status).toBe(200)
  const exported = await prepareExport(label, "webpub", root, path.resolve("assets/adt"), configPath)
  expect(exported.warnings).toContainEqual({ kind: "missing-storyboard", pageId: "p2" })
})

it("newly completed source output cannot complete an older partial package", async () => {
  expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
  const adt = path.join(dir, "adt")
  fs.mkdirSync(path.join(adt, "content"), { recursive: true })
  const entries = ["p2_sec001", "p2_sec002", "p7_sec001", "p7_sec002"].map((id) => ({ section_id: id, href: `${id}.html` }))
  for (const entry of entries) fs.writeFileSync(path.join(adt, entry.href), "<p>Retained output</p>")
  const manifest = path.join(adt, "content", "pages.json")
  fs.writeFileSync(manifest, JSON.stringify(entries.slice(0, 2)))
  const status = await (await app.request(`/books/${label}/package-adt/status`)).json()
  expect(status).toMatchObject({ hasAdt: true, complete: false })
  expect((await (await app.request(`/books/${label}/step-status`)).json()).stages.preview).not.toBe("done")
  const books = await (await app.request("/books")).json()
  expect(books[0].completedStages).not.toContain("preview")
  // Retained complete membership is usable even without a new build hash;
  // this is coverage, not an extra lifecycle/freshness gate.
  fs.writeFileSync(manifest, JSON.stringify(entries))
  expect(await (await app.request(`/books/${label}/package-adt/status`)).json()).toMatchObject({ hasAdt: true, complete: true })
  expect((await (await app.request(`/books/${label}/step-status`)).json()).stages.preview).toBe("done")
  fs.unlinkSync(path.join(adt, entries[3].href))
  expect(await (await app.request(`/books/${label}/package-adt/status`)).json()).toMatchObject({ hasAdt: true, complete: false })
})


it("queued Sectioning revalidates the reviewed configuration before resetting any page", async () => {
  const consent = await replacement()
  const before = ["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])
  const errors: string[] = []
  bus.addListener(label, event => { if (event.type === "stage-run-error") errors.push(event.error) })
  let release!: () => void
  renderPage.mockImplementationOnce(async ({ sectioning }) => {
    await new Promise<void>(resolve => { release = resolve })
    return { sections: sectioning.sections.map((section: { sectionId: string; sectionType: string }, sectionIndex: number) => ({
      sectionIndex, sectionType: section.sectionType, reasoning: "fixture", html: `<section data-section-id="${section.sectionId}">New</section>` })) }
  })
  expect((await send("stages/run", { fromStage: "storyboard", toStage: "storyboard", pageErrorPolicy: "stop" })).status).toBe(200)
  await vi.waitFor(() => expect(release).toBeDefined())
  const queued = await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", pageErrorPolicy: "stop", ...consent })
  expect(await queued.json()).toMatchObject({ status: "queued" })
  fs.appendFileSync(configPath, "editing_language: fr\n")
  release()
  await vi.waitFor(() => { expect(service.getStatus(label).active?.status).toBe("failed"); expect(service.getStatus(label).queue).toHaveLength(0) }, { timeout: 10_000 })
  expect(errors.some(error => error.includes("REPLACEMENT_CONFIRMATION_INVALID"))).toBe(true)
  expect(sectionPage).not.toHaveBeenCalled()
  expect(["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])).toEqual(before)
})

it("direct runner refuses a replacement receipt from another book namespace", async () => {
  const consent = await replacement()
  const otherLabel = "other-book"
  fs.cpSync(dir, path.join(root, otherLabel), { recursive: true })
  fs.renameSync(path.join(root, otherLabel, `${label}.db`), path.join(root, otherLabel, `${otherLabel}.db`))
  await expect(createStageRunner().run(otherLabel, { booksDir: root, promptsDir: root, configPath,
    fromStage: "sectioning", toStage: "sectioning", ...consent }, { emit() {} })).rejects.toThrow("REPLACEMENT_CONFIRMATION_INVALID")
  expect(sectionPage).not.toHaveBeenCalled()
  const other = createBookStorage(otherLabel, root)
  try { expect(other.getAllNodeVersions("web-rendering", "p2")).toEqual(history("web-rendering", "p2")) }
  finally { other.close() }
})

it("rejects changed extracted text at publication even when page IDs and versions are unchanged", async () => {
  const consent = await replacement()
  const before = ["p2", "p7"].map(id => history("page-sectioning", id))
  sectionPage.mockImplementationOnce(async ({ pageId }) => {
    // Model a noncooperating external edit at the actual SQLite boundary.
    const external = openBookDb(path.join(dir, `${label}.db`))
    try { external.run("UPDATE pages SET text = ? WHERE page_id = ?", ["External source text", "p2"]) }
    finally { external.close() }
    return tree(pageId)
  })
  const result = await run({ ...consent, toStage: "sectioning", pageErrorPolicy: "stop" })
  expect(result.status).toBe("failed")
  expect(result.error).toContain("STORYBOARD_INPUT_CHANGED")
  expect(["p2", "p7"].map(id => history("page-sectioning", id))).toEqual(before)
  // The explicit reset remains committed; obsolete HTML never returns as current.
  expect(history("web-rendering", "p2")).toHaveLength(2)
  expect(history("web-rendering", "p2")[1].data).toBeNull()
})


it.each(["sync", "task"].flatMap(entry => ["missing", "json-null", "unreadable"].map(input => ({ entry, input }))))("batch HTTP $entry rendering preserves $input input and publishes its runnable neighbor", async ({ entry, input }) => {
  const raw = openBookDb(path.join(dir, `${label}.db`))
  if (input === "missing") { raw.run("DELETE FROM node_current WHERE node = ? AND item_id = ?", ["page-sectioning", "p2"]); raw.run("DELETE FROM node_data WHERE node = ? AND item_id = ?", ["page-sectioning", "p2"]) }
  else raw.run("UPDATE node_data SET data = ? WHERE node = ? AND item_id = ?", [input === "json-null" ? "null" : "{unreadable", "page-sectioning", "p2"])
  const before = raw.all("SELECT * FROM node_data WHERE node = ? AND item_id = ?", ["page-sectioning", "p2"])
  raw.close()
  const retained = history("web-rendering", "p2")
  const tasks = createTaskService(bus, root)
  const target = new Hono().onError(errorHandler).route("/", createPageRoutes(root, root, undefined, configPath, entry === "task" ? tasks : undefined))
  const response = await target.request(`/books/${label}/pages/re-render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageIds: ["p2", "p7"] }) })
  if (entry === "task") {
    expect(response.status).toBe(200)
    await vi.waitFor(() => expect(tasks.getActiveTasks(label)[0]?.status).toBe("failed"))
    expect(tasks.getActiveTasks(label)[0].error).toContain("STORYBOARD_PAGE_INPUT_MISSING")
  } else {
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "STORYBOARD_PAGE_INPUT_MISSING" })
  }
  expect(renderPage.mock.calls.map(([input]) => input.pageId)).toEqual(["p7"])
  expect(history("web-rendering", "p2")).toEqual(retained)
  expect(history("web-rendering", "p7")).toHaveLength(2)
  const check = openBookDb(path.join(dir, `${label}.db`))
  try { expect(check.all("SELECT * FROM node_data WHERE node = ? AND item_id = ?", ["page-sectioning", "p2"])).toEqual(before) }
  finally { check.close() }
})

it("fixed batch HTTP rendering uses valid positioned input without requiring semantic Sectioning", async () => {
  fs.appendFileSync(configPath, "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
  const s = store(); s.putNodeData("page-sectioning", "p2", null); s.close()
  const response = await send("pages/re-render", { pageIds: ["p2", "p7"] })
  expect(response.status, await response.clone().text()).toBe(200)
  expect(renderPage).not.toHaveBeenCalled()
  expect(history("fixed-layout-sectioning", "p2")).toHaveLength(1)
  expect(history("web-rendering", "p7")).toHaveLength(2)
  expect(history("page-sectioning", "p2")[1].data).toBeNull()
})


it.each(["first generation", "same-layout rerun"].flatMap(runKind => [false, true].map(cancel => ({ runKind, cancel }))))(
  "fixed $runKind exposes the first committed page through real HTTP before the slow next page (cancel=$cancel)",
  async ({ runKind, cancel }) => {
    fs.appendFileSync(configPath, "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
    if (runKind === "same-layout rerun") {
      expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
    } else {
      const s = store()
      for (const id of ["p2", "p7"]) s.putNodeData("web-rendering", id, null)
      s.close()
    }
    const beforeFirst = history("web-rendering", "p2")
    const beforeSecond = [history("web-rendering", "p7"), history("fixed-layout-sectioning", "p7")]
    const published: string[] = []
    let settled = false
    const dispose = bus.addListener(label, event => {
      if (event.type === "progress" && event.data.type === "step-progress" && event.data.publishedPageId) {
        published.push(event.data.publishedPageId)
        if (event.data.publishedPageId === "p2") scheduling.afterFirstPage = true
      }
      if (["stage-run-complete", "stage-run-error", "stage-run-cancelled"].includes(event.type)) settled = true
    })
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 })
    if (!server.listening) await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject) })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing test server port")
    const base = `http://127.0.0.1:${address.port}/books/${label}`
    try {
      const started = await fetch(`${base}/stages/run`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromStage: "storyboard", toStage: "storyboard" }) })
      expect(started.status).toBe(200)
      await vi.waitFor(() => expect(scheduling.release).toBeTypeOf("function"))
      expect(settled).toBe(false)
      expect(published).toEqual(["p2"])
      const response = await fetch(`${base}/pages/p2`)
      expect(response.status).toBe(200)
      const page = await response.json()
      expect(page.versions.rendering).toBe(beforeFirst.at(-1)!.version + 1)
      expect(page.rendering.sections[0]).toMatchObject({ sectionType: "fixed-layout-page", sectionId: "p2_sec001" })
      expect(page.rendering.sections[0].html).toContain("data-section-id")
      expect(settled).toBe(false)
      expect([history("web-rendering", "p7"), history("fixed-layout-sectioning", "p7")]).toEqual(beforeSecond)
      if (cancel) expect((await fetch(`${base}/stages/cancel`, { method: "POST" })).status).toBe(202)
      scheduling.afterFirstPage = false
      scheduling.release!()
      await vi.waitFor(() => expect(settled).toBe(true))
      expect(history("web-rendering", "p2").at(-1)!.version).toBe(page.versions.rendering)
      if (cancel) {
        expect(published).toEqual(["p2"])
        expect([history("web-rendering", "p7"), history("fixed-layout-sectioning", "p7")]).toEqual(beforeSecond)
        // Cancellation releases admission: the next real HTTP action succeeds.
        expect((await fetch(`${base}/pages/p7/re-render`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(200)
      } else expect(published).toEqual(["p2", "p7"])
      expect(renderPage).not.toHaveBeenCalled()
    } finally {
      scheduling.afterFirstPage = false
      scheduling.release?.()
      scheduling.release = undefined
      service.cancelStageRun(label)
      await vi.waitFor(() => expect(service.getStatus(label).active).toBeNull())
      dispose()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  },
)
