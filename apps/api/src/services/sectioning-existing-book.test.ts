import { damageNodePayload } from "../../../../packages/storage/src/__tests__/helpers/physical-damage.js"
import { randomUUID } from "node:crypto"
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
import { unzipSync } from "fflate"
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

it("rejects a changed effective Sectioning prompt before reset and accepts a freshly reviewed receipt", async () => {
  const prompt = path.join(root, "page_sectioning.liquid")
  fs.writeFileSync(prompt, "Reviewed prompt")
  const receipt = await replacement(["p2"])
  const before = history("web-rendering", "p2")
  fs.writeFileSync(prompt, "Changed prompt")
  const rejected = await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...receipt })
  expect(rejected.status).toBe(409)
  expect(sectionPage).not.toHaveBeenCalled()
  expect(history("web-rendering", "p2")).toEqual(before)
  expect((await run({ toStage: "sectioning", ...await replacement(["p2"]) })).status).toBe("completed")
  expect(sectionPage).toHaveBeenCalledTimes(1)
})

it("binds a byte-identical prompt version selection and rejects a prompt change at publication", async () => {
  const versions = path.join(dir, "prompts/.versions/page_sectioning")
  fs.mkdirSync(versions, { recursive: true })
  for (const version of ["1.liquid", "2.liquid"]) fs.writeFileSync(path.join(versions, version), "Identical reviewed prompt")
  fs.writeFileSync(path.join(versions, ".current"), "1.liquid")
  const stale = await replacement(["p2"])
  fs.writeFileSync(path.join(versions, ".current"), "2.liquid")
  expect((await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...stale })).status).toBe(409)
  expect(sectionPage).not.toHaveBeenCalled()
  const before = history("page-sectioning", "p2")
  const fresh = await replacement(["p2"])
  sectionPage.mockImplementationOnce(async ({ pageId }) => {
    fs.writeFileSync(path.join(versions, "2.liquid"), "Changed outside the supported writer during generation")
    return tree(pageId)
  })
  const result = await run({ toStage: "sectioning", ...fresh, pageErrorPolicy: "stop" })
  expect(result.status).toBe("failed")
  expect(result.error).toContain("STORYBOARD_INPUT_CHANGED")
  expect(history("page-sectioning", "p2")).toEqual(before)
  expect(history("web-rendering", "p2").at(-1)?.data).toBeNull()
})
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

function rawHistoryState() {
  const db = openBookDb(path.join(dir, `${label}.db`))
  try {
    return {
      rows: db.all("SELECT node, item_id, version, data FROM node_data ORDER BY node, item_id, version"),
      selected: db.all("SELECT node, item_id, version FROM node_current ORDER BY node, item_id"),
    }
  } finally { db.close() }
}

it("keeps legacy section-mode books readable, runnable and editable through public callers", async () => {
  const file = path.join(dir, "config.yaml")
  const legacy = "page_sectioning:\n  mode: section\nconcurrency: 1\n"
  fs.writeFileSync(file, legacy)
  const before = ["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])
  const listed = await app.request("/books")
  expect(listed.status).toBe(200)
  expect(JSON.stringify(await listed.json())).not.toContain('"readUnavailable":true')
  expect((await app.request(`/books/${label}`)).status).toBe(200)
  expect((await app.request(`/books/${label}/step-status`)).status).toBe(200)
  expect((await app.request(`/books/${label}/adt-preview/content/pages.json`)).status).toBe(200)
  await prepareExport(label, "webpub", root, path.resolve("assets/adt"), configPath)
  expect(fs.readFileSync(file, "utf8")).toBe(legacy)
  expect((await run({ toStage: "sectioning" })).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  // Settings readers return a usable modern value, so an unrelated save need
  // not echo an invalid legacy alias back through the strict write boundary.
  const current = await (await app.request(`/books/${label}/config`)).json()
  expect(current.config.page_sectioning.mode).toBe("dynamic")
  expect((await send("config", { ...current.config, concurrency: 2 }, "PUT")).status).toBe(200)
  expect((await send("config", { page_sectioning: { mode: "page" } }, "PUT")).status).toBe(200)
  const saved = fs.readFileSync(file, "utf8")
  expect(saved).toContain("mode: page")
  for (const mode of ["section", "arbitrary-invalid"]) {
    expect((await send("config", { page_sectioning: { mode } }, "PUT")).status).toBe(400)
    expect(fs.readFileSync(file, "utf8")).toBe(saved)
  }
  expect(["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])).toEqual(before)
}, 30000)

function damageNeighborHistory() {
  const db = openBookDb(path.join(dir, `${label}.db`))
  try { db.run("UPDATE node_data SET data = ? WHERE node = ? AND item_id = ? AND version = ?", ["{unreadable historical identity", "page-sectioning", "p7", 1]) }
  finally { db.close() }
}

it("history admission refuses healthy-page replacement before reset or generation", async () => {
  const consent = await replacement(["p2"])
  damageNeighborHistory()
  const before = rawHistoryState()
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "storyboard", ...consent })
  // Settle the old broken implementation too, so the negative baseline never
  // removes its fixture while its worker is still running.
  if (response.status === 200) await vi.waitFor(() => expect(service.getStatus(label).active?.status).toBe("failed"), { timeout: 10_000 })
  expect.soft(response.status).toBe(409)
  expect.soft(await response.json()).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED" })
  expect.soft(sectionPage).not.toHaveBeenCalled()
  expect.soft(renderPage).not.toHaveBeenCalled()
  expect(rawHistoryState()).toEqual(before)
})

it("history admission also protects a direct runner before reset", async () => {
  const consent = await replacement(["p2"])
  damageNeighborHistory()
  const before = rawHistoryState()
  await expect(createStageRunner().run(label, {
    booksDir: root, promptsDir: root, configPath,
    fromStage: "sectioning", toStage: "sectioning", ...consent,
  }, { emit: () => undefined })).rejects.toThrow("HISTORY_REPAIR_REQUIRED")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(rawHistoryState()).toEqual(before)
})

it("history admission refuses ordinary missing-page generation without changing retained pages", async () => {
  const s = store()
  try {
    s.putExtractedPage({ pageId: "p9", pageNumber: 9, text: "New page", images: [], pageImage: { imageId: "p9_page", buffer: Buffer.from("untouched pixels"), format: "png", hash: "pixels", width: 4, height: 6 } })
  } finally { s.close() }
  damageNeighborHistory()
  const before = rawHistoryState()
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "sectioning" })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED" })
  expect(sectionPage).not.toHaveBeenCalled()
  expect(rawHistoryState()).toEqual(before)
})

it("history admission revalidates a queued replacement before reset", async () => {
  const consent = await replacement(["p2"])
  const errors: string[] = []
  bus.addListener(label, event => { if (event.type === "stage-run-error") errors.push(event.error) })
  let release!: () => void
  renderPage.mockImplementation(async () => {
    await new Promise<void>(resolve => { release = resolve })
    throw new Error("Controlled predecessor failure")
  })
  expect((await send("stages/run", { fromStage: "storyboard", toStage: "storyboard", pageErrorPolicy: "stop" })).status).toBe(200)
  await vi.waitFor(() => expect(release).toBeDefined())
  expect(await (await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...consent })).json()).toMatchObject({ status: "queued" })
  // Inject physical corruption after enqueue, without using a supported writer
  // to acquire the predecessor's lease. This is a fault, not allowed concurrency.
  damageNeighborHistory()
  const before = rawHistoryState()
  release()
  await vi.waitFor(() => {
    expect(service.getStatus(label).queue).toHaveLength(0)
    expect(errors.some(error => error.includes("HISTORY_REPAIR_REQUIRED"))).toBe(true)
  }, { timeout: 10_000 })
  expect(sectionPage).not.toHaveBeenCalled()
  expect(rawHistoryState()).toEqual(before)
})

it("history admission leaves no-op Sectioning and usable Storyboard reads available", async () => {
  damageNeighborHistory()
  const before = rawHistoryState()
  expect((await run({ toStage: "sectioning" })).status).toBe("completed")
  expect(sectionPage).not.toHaveBeenCalled()
  expect(rawHistoryState()).toEqual(before)
  expect((await app.request(`/books/${label}/pages`)).status).toBe(200)
  expect((await app.request(`/books/${label}/pages/p2`)).status).toBe(200)
  expect((await run({ fromStage: "storyboard", toStage: "storyboard" })).status).toBe("completed")
  expect(renderPage).toHaveBeenCalledTimes(1)
  expect(history("web-rendering", "p2")).toHaveLength(2)
})

// Fault injection bypasses the SQL continuity trigger to model physical damage.
// Ordinary SQL UPDATE and reused tuple refusal are separate storage regressions.
it.each(["reflowable", "fixed", "reflowable-part", "fixed-part"])("verified recovery then fresh replacement, split and publication: %s", async layout => {
  if (layout.startsWith("fixed")) fs.appendFileSync(configPath, "default_render_strategy: fixed\nrender_strategies:\n  fixed:\n    render_type: fixed_layout\n")
  if (layout.endsWith("part")) fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: label, title: null,
    range: { startPage: 5, endPage: 10 }, pageCount: 100, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  const target = layout.endsWith("part") ? "p7" : "p2"
  const neighbor = target === "p7" ? "p2" : "p7"
  const before = [history("page-sectioning", neighbor), history("web-rendering", neighbor)]
  const source = fs.readFileSync(path.join(dir, `images/${target}_page.png`))
  const oldConsent = await replacement([target])
  // Genuine physical damage leaves insertion tracking and proof intact.
  const damagedHex = damageNodePayload(path.join(dir, `${label}.db`), "page-sectioning", target, 1)
  const status = await (await app.request(`/books/${label}/history-recovery`)).json()
  expect(status.issues).toMatchObject([{ node: "page-sectioning", itemId: target, version: 1, reason: "recoverable" }])
  const request = { snapshot: status.snapshot, requestId: randomUUID(), confirmed: true,
    records: status.issues.map(({ reason: _, ...record }: Record<string, unknown>) => record) }
  const repaired = await send("history-recovery/repair", request)
  expect(repaired.status, await repaired.clone().text()).toBe(200)
  expect(await repaired.json()).toMatchObject({ count: 1, selectedVersions: [{ node: "page-sectioning", itemId: target, version: 2 }] })
  expect(sectionPage).not.toHaveBeenCalled()
  expect(renderPage).not.toHaveBeenCalled()
  expect(history("web-rendering", target)).toHaveLength(1)
  const audit = await app.request(`/books/${label}/history-recovery/audit/${request.requestId}`)
  expect(audit.status).toBe(200)
  expect(await audit.json()).toMatchObject([{ damaged: { hex: damagedHex } }])
  expect((await send(`pages/${target}/sections/0/split`, { baseVersion: 1, beforeNodeIndex: 1 })).status).toBe(409)
  expect((await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...oldConsent })).status).toBe(409)
  expect(sectionPage).not.toHaveBeenCalled()
  expect((await send("config", { page_sectioning: { mode: "page" } }, "PUT")).status).toBe(200)
  expect((await run({ toStage: "sectioning", ...await replacement([target]) })).status).toBe("completed")
  expect((await send(`pages/${target}/sections/0/split`, { baseVersion: 3, beforeNodeIndex: 1 })).status).toBe(200)
  expect((await run({ fromStage: "storyboard", toStage: "storyboard" })).status).toBe("completed")
  const storage = store()
  try { expect(storyboardCoverage(storage, [target]).complete).toBe(true) } finally { storage.close() }
  expect(history("page-sectioning", neighbor)).toEqual(before[0])
  // Ordinary Storyboard may refresh the active neighbor, but a part must not.
  if (layout.endsWith("part")) expect(history("web-rendering", neighbor)).toEqual(before[1])
  expect(fs.readFileSync(path.join(dir, `images/${target}_page.png`))).toEqual(source)
})

it("recovery HTTP validates explicit confirmation and stale snapshots without mutation", async () => {
  const state = await (await app.request(`/books/${label}/history-recovery`)).json()
  const before = rawHistoryState()
  expect((await send("history-recovery/repair", { snapshot: state.snapshot, requestId: randomUUID(), records: [] })).status).toBe(400)
  expect((await send("history-recovery/checkpoint", { snapshot: "0".repeat(64), requestId: randomUUID(), confirmed: true })).status).toBe(409)
  const absentBook = await app.request("/books/absent-book/history-recovery")
  expect(absentBook.status).toBe(404)
  expect(await absentBook.json()).toMatchObject({ code: "HISTORY_RECOVERY_BOOK_MISSING" })
  const absentAudit = await app.request(`/books/${label}/history-recovery/audit/${randomUUID()}`)
  expect(absentAudit.status).toBe(404)
  expect(await absentAudit.json()).toMatchObject({ code: "HISTORY_RECOVERY_AUDIT_MISSING" })
  expect(rawHistoryState()).toEqual(before)
})

it("lost recovery tracking retains usable HTTP reads but refuses reset before provider work", async () => {
  const consent = await replacement(["p2"])
  const before = rawHistoryState()
  const db = openBookDb(path.join(dir, `${label}.db`))
  try { db.exec("DROP TRIGGER history_track_update") } finally { db.close() }
  expect((await app.request("/books")).status).toBe(200)
  expect((await app.request(`/books/${label}/pages/p2`)).status).toBe(200)
  expect((await app.request(`/books/${label}/history-recovery`)).status).toBe(409)
  const result = await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", ...consent })
  expect(result.status).toBe(409)
  expect(await result.json()).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED" })
  expect(sectionPage).not.toHaveBeenCalled()
  expect(rawHistoryState()).toEqual(before)
})

it.each(["history_recovery_requests", "history_recovery_audit", "history_repair_permits"])("recovery endpoints diagnose missing %s before querying damaged evidence", async table => {
  const state = await (await app.request(`/books/${label}/history-recovery`)).json()
  const before = rawHistoryState()
  const db = openBookDb(path.join(dir, `${label}.db`))
  try { db.exec(`DROP TABLE ${table}`) } finally { db.close() }
  const body = { snapshot: state.snapshot, requestId: randomUUID(), confirmed: true }
  const results = [
    await app.request(`/books/${label}/history-recovery`),
    await send("history-recovery/checkpoint", body),
    await send("history-recovery/repair", { ...body, records: [{ node: "page-sectioning", itemId: "p2", version: 1, beforeHash: "0".repeat(64), witnessHash: "0".repeat(64) }] }),
    await app.request(`/books/${label}/history-recovery/audit/${body.requestId}`),
  ]
  for (const response of results) {
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED" })
  }
  expect(rawHistoryState()).toEqual(before)
})

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

it.each(["configuration", "book-outline", "image-filtering"])("%s edits during generation retain authored Sectioning and the committed reset", async source => {
  sectionPage.mockImplementationOnce(async ({ pageId }) => {
    if (source === "configuration") fs.appendFileSync(configPath, "editing_language: fr\n")
    else {
      const s = store()
      try {
        if (source === "book-outline") s.putNodeData(source, "book", { entries: [], styleClusters: [], reasoning: "Revised" })
        else s.putNodeData(source, pageId, { images: [{ imageId: pageId + "_page", isPruned: true }] })
      } finally { s.close() }
    }
    return tree(pageId)
  })
  const before = history("page-sectioning", "p2")
  expect((await run(await replacement())).status).toBe("failed")
  expect(history("page-sectioning", "p2")).toEqual(before)
  expect(history("web-rendering", "p2")).toHaveLength(2)
  expect(history("web-rendering", "p2")[1].data).toBeNull()
})

it.each(["global config", "book config", "persisted window", "image decision", "outline", "missing receipt"])("rejects replacement consent after changed %s without altering content", async (change) => {
  const consent = await replacement()
  const before = ["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])
  const pixels = fs.readFileSync(path.join(dir, "images/p7_page.png"))
  if (change === "global config") fs.appendFileSync(configPath, "editing_language: fr\n")
  if (change === "book config") expect((await send("config", { page_sectioning: { mode: "page" } }, "PUT")).status).toBe(200)
  // Same extracted page membership: a range change itself invalidates consent.
  if (change === "persisted window") fs.writeFileSync(path.join(dir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: label, title: null,
    range: { startPage: 1, endPage: 10 }, pageCount: 100, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  if (change === "image decision" || change === "outline") {
    const s = store()
    try {
      if (change === "image decision") s.putNodeData("image-filtering", "p2", { images: [{ imageId: "p2_page", isPruned: true }] })
      else s.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "Revised by reviewer" })
    } finally { s.close() }
  }
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

it("refuses a selected schema-unreadable replacement before resetting any output", async () => {
  const s = store()
  s.putNodeData("page-sectioning", "p2", { source: "manual", sections: "invalid" })
  const steps = s.getStepRuns()
  s.close()
  const nodes = ["page-sectioning", "web-rendering", "fixed-layout-sectioning", "editable-activities"]
  const snapshot = () => ["p2", "p7"].map(id => nodes.map(node => history(node, id)))
  const before = snapshot()
  const response = await send("stages/run", { fromStage: "sectioning", toStage: "storyboard", pageErrorPolicy: "stop", ...await replacement(["p2"]) })
  await vi.waitFor(() => expect(service.getStatus(label).active).toBeNull(), { timeout: 10_000 })
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "SECTIONING_INPUT_UNREADABLE" })
  expect(snapshot()).toEqual(before)
  const after = store()
  try { expect(after.getStepRuns()).toEqual(steps) } finally { after.close() }
  expect(sectionPage).not.toHaveBeenCalled()
  expect(renderPage).not.toHaveBeenCalled()
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

it("keeps an already packaged healthy page readable when a neighbor becomes unreadable", async () => {
  const db = store(); db.putNodeData("web-rendering", "p2", null); db.close()
  const url = `/books/${label}`
  expect((await app.request(url + "/package-adt", { method: "POST" })).status).toBe(200)
  const raw = openBookDb(path.join(dir, label + ".db"))
  raw.run("UPDATE node_data SET data = ? WHERE node = 'page-sectioning' AND item_id = 'p2'", ["{"])
  raw.close()
  const status = await app.request(url + "/step-status")
  expect(status.status, await status.clone().text()).toBe(200)
  expect((await status.json()).coverage).toMatchObject({ complete: false, missingPages: ["p2"] })
  expect(await (await app.request(url + "/package-adt/status")).json()).toMatchObject({ hasAdt: true, complete: false })
  const download = await app.request(url + "/export-adt")
  expect(download.status, await download.clone().text()).toBe(200)
  const zip = unzipSync(new Uint8Array(await download.arrayBuffer()))
  expect(Buffer.from(zip["p7_sec001.html"]).toString()).toContain("Retained HTML")
  expect(zip["p2_sec001.html"]).toBeUndefined()
  expect((await app.request(url + "/adt/p7_sec001.html")).status).toBe(200)
})

it("does not serve a pre-fix restamped fixed package even after the same ID becomes live again", async () => {
  const url = `/books/${label}`, id = "p2_sec001", other = "p7_sec001"
  expect((await app.request(url + "/package-adt", { method: "POST" })).status).toBe(200)
  const adt = path.join(dir, "adt")
  fs.unlinkSync(path.join(adt, ".build-owners"))  // Older producer: no independent owner receipt.
  const stale = '<div id="content" data-section-id="p2_sec001">Wrong-owner text</div>'
  fs.writeFileSync(path.join(adt, id + ".html"), stale)
  fs.writeFileSync(path.join(adt, "assets/offline-preloader.js"), JSON.stringify(stale))
  const s = store()
  const retained = s.getLatestNodeData("web-rendering", "p2")!
  s.putNodeData("fixed-layout-sectioning", "p2", tree("p2", 1))
  s.putNodeData("web-rendering", "p2", { sections: [{ sectionIndex: 0, sectionType: "fixed-layout-page", reasoning: "", html: '<div id="content" DATA-SECTION-ID="retired">Wrong-owner text</div>' }] })
  s.close()
  for (const version of ["", "v-old/"]) {
    expect((await app.request(url + "/adt/" + version + id + ".html")).status).toBe(404)
    const neighbor = await app.request(url + "/adt/" + version + other + ".html")
    expect(neighbor.headers.get("Location")).toBe(`/api${url}/adt-preview/${other}.html`)
    const first = await app.request(url + "/adt/" + version)
    expect(first.headers.get("Location")).toBe(neighbor.headers.get("Location"))
    const script = await app.request(url + "/adt/" + version + "assets/offline-preloader.js")
    expect(await script.text()).not.toContain("Wrong-owner text")
  }
  const again = store(); again.putNodeData("web-rendering", "p2", retained.data); again.close()
  const old = await app.request(url + "/adt/v-old/" + id + ".html")
  expect(old.status).toBe(307)
  expect(old.headers.get("Location")).toBe(`/api${url}/adt-preview/${id}.html`)
  expect((await app.request(url + "/export-adt")).status).toBe(409)
  expect(fs.readFileSync(path.join(adt, id + ".html"), "utf8")).toBe(stale)
  expect((await app.request(url + "/package-adt", { method: "POST" })).status).toBe(200)
  const fresh = await app.request(url + "/adt/" + id + ".html")
  expect(fresh.status).toBe(200)
  expect(await fresh.text()).toContain("Retained HTML")
})

it("newly completed source output cannot complete an older partial package", async () => {
  expect((await run({ fromStage: "storyboard" })).status).toBe("completed")
  const adt = path.join(dir, "adt")
  expect((await app.request(`/books/${label}/package-adt`, { method: "POST" })).status).toBe(200)
  const entries = JSON.parse(fs.readFileSync(path.join(adt, "content/pages.json"), "utf8")) as Array<{ section_id: string; href: string }>
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


it.each(["configuration", "outline", "image-filtering", "prompt", "page window"])("queued Sectioning revalidates %s before resetting any page", async change => {
  const consent = await replacement()
  const before = ["p2", "p7"].map(id => [history("page-sectioning", id), history("web-rendering", id)])
  const errors: string[] = []
  bus.addListener(label, event => { if (event.type === "stage-run-error") errors.push(event.error) })
  let release!: () => void
  // Hold the queue without publishing a new HTML version. A successful
  // predecessor would also invalidate the output guards, masking the intended
  // source-only change (an outline change does not invalidate Storyboard).
  renderPage.mockImplementation(async ({ pageId }: { pageId: string }) => {
    if (pageId === "p2") await new Promise<void>(resolve => { release = resolve })
    throw new Error("Controlled predecessor failure")
  })
  expect((await send("stages/run", { fromStage: "storyboard", toStage: "storyboard", pageErrorPolicy: "stop" })).status).toBe(200)
  await vi.waitFor(() => expect(release).toBeDefined())
  const queued = await send("stages/run", { fromStage: "sectioning", toStage: "sectioning", pageErrorPolicy: "stop", ...consent })
  expect(await queued.json()).toMatchObject({ status: "queued" })
  if (change === "configuration") fs.appendFileSync(configPath, "editing_language: fr\n")
  else if (change === "prompt") fs.writeFileSync(path.join(root, "page_sectioning.liquid"), "Changed while queued")
  // Membership is unchanged: the persisted window itself binds consent.
  else if (change === "page window") fs.writeFileSync(path.join(dir, "config.yaml"), "start_page: 2\nend_page: 7\n")
  else {
    const s = store()
    try {
      if (change === "outline") s.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "Changed while queued" })
      else s.putNodeData("image-filtering", "p2", { images: [{ imageId: "p2_page", isPruned: true }] })
    } finally { s.close() }
  }
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

// REVIEWER-DESIGNED, NOT RUN. Append this test to:
// apps/api/src/services/sectioning-existing-book.test.ts
// It intentionally reuses that file's real storage/Hono/stage runner fixtures
// and its controlled sectionPage/renderPage outputs. No ownership/reset/read
// helper is mocked. This is not provider accounting or a paid-model test.
it("explicit scoped Sectioning replacement cannot attach an old enabled stepper to a new same-index same-type section", async () => {
  const { EditableActivitiesEntity, EDITABLE_ACTIVITY_NODE, PageSectioningOutput } = await import("@adt/types")
  const { unzipSync } = await import("fflate")
  const { exportAdt } = await import("./export-service.js")
  const oldMarker = "OLD_STEPPER_ANSWER_NOT_CURRENT"
  const newMarker = "NEW_GENERATED_ACTIVITY_CURRENT"
  const activityTree = (fresh: boolean) => {
    const data = tree("p2", 1, fresh ? "ai" : "manual")
    data.sections[0].sectionType = "activity_multiple_choice"
    data.sections[0].nodes = [{
      nodeId: fresh ? "p2_new_activity_text" : "p2_old_activity_text",
      text: fresh ? newMarker : "Old semantic question", role: "text", isPruned: false,
    }]
    return PageSectioningOutput.parse(data)
  }
  const seeded = store()
  let oldOwner: string
  try {
    const oldTree = activityTree(false)
    oldOwner = oldTree.sections[0].sectionId!
    seeded.putNodeData("page-sectioning", "p2", oldTree)
    const renderingVersion = seeded.putNodeData("web-rendering", "p2", { sections: [{
      sectionIndex: 0, sectionId: oldOwner, sectionType: "activity_multiple_choice", reasoning: "old",
      html: `<section data-section-id="${oldOwner}"><p data-id="p2_old_activity_text">Old semantic question</p></section>`,
    }] })
    seeded.putNodeData(EDITABLE_ACTIVITY_NODE, "p2", EditableActivitiesEntity.parse({ activities: { "0": {
      kind: "multiple-choice", sectionType: "activity_multiple_choice", enabled: true,
      sourceRenderingVersion: renderingVersion,
      steps: [{ id: "old-group", prompt: { text: oldMarker, dataId: "old-stepper-question" }, options: [
        { itemId: "old-correct", correct: true, text: { text: "OLD_CORRECT_ANSWER" } },
        { itemId: "old-wrong", correct: false, text: { text: "OLD_WRONG_ANSWER" } },
      ] }],
    } } }))
  } finally { seeded.close() }
  const oldActivity = history(EDITABLE_ACTIVITY_NODE, "p2")
  const oldSource = history("page-sectioning", "p2")
  const oldHtml = history("web-rendering", "p2")
  const neighbor = [history("page-sectioning", "p7"), history("web-rendering", "p7"), history(EDITABLE_ACTIVITY_NODE, "p7")]
  const pixels = fs.readFileSync(path.join(dir, "images/p2_page.png"))
  // Positive control: the pre-reset stepper is genuinely visible through the
  // production Preview route, not merely a stored but invalid test object.
  const beforePreview = await app.request(`/books/${label}/adt-preview/${oldOwner!}.html`)
  expect(beforePreview.status, await beforePreview.clone().text()).toBe(200)
  expect(await beforePreview.text()).toContain(oldMarker)

  sectionPage.mockImplementationOnce(async ({ pageId }: { pageId: string }) => {
    expect(pageId).toBe("p2")
    return activityTree(true)
  })
  renderPage.mockImplementation(async ({ sectioning }: { sectioning: ReturnType<typeof activityTree> }) => ({ sections: sectioning.sections.map((section, sectionIndex) => ({
    sectionIndex, sectionId: section.sectionId, sectionType: section.sectionType, reasoning: "new",
    html: `<section data-section-id="${section.sectionId}"><p data-id="p2_new_activity_text">${newMarker}</p></section>`,
  })) }))
  const consent = await replacement(["p2"])
  expect(consent.protectedReplacements.map((record: { itemId: string }) => record.itemId)).toEqual(["p2"])
  expect((await run({ ...consent, toStage: "sectioning" })).status).toBe("completed")
  const afterReset = store()
  let owner: string
  try {
    expect(afterReset.getLatestNodeData("web-rendering", "p2")?.data).toBeNull()
    const current = PageSectioningOutput.parse(afterReset.getLatestNodeData("page-sectioning", "p2")?.data)
    expect(current.sections).toHaveLength(1)
    expect(current.sections[0].sectionType).toBe("activity_multiple_choice")
    owner = current.sections[0].sectionId!
    expect(owner).not.toBe(oldOwner!)
    expect(JSON.stringify(current)).toContain(newMarker)
  } finally { afterReset.close() }
  const rendered = await send("pages/p2/re-render", {})
  expect(rendered.status, await rendered.clone().text()).toBe(200)
  expect(sectionPage).toHaveBeenCalledTimes(1)
  expect(renderPage).toHaveBeenCalledTimes(1)

  // Inspect the actual Preview and packaged HTML. Correct stored rendering
  // alone is insufficient: both readers independently support stepper overrides.
  const preview = await app.request(`/books/${label}/adt-preview/${owner!}.html`)
  expect(preview.status, await preview.clone().text()).toBe(200)
  const previewHtml = await preview.text()
  expect.soft(previewHtml).toContain(newMarker)
  expect.soft(previewHtml).not.toContain(oldMarker)
  expect.soft(previewHtml).not.toContain("OLD_CORRECT_ANSWER")
  await prepareExport(label, "adt", root, path.resolve("assets/adt"), configPath)
  const artifact = await exportAdt(label, root)
  const members = unzipSync(new Uint8Array(await new Response(artifact.stream).arrayBuffer()))
  expect(members[`${owner!}.html`]).toBeDefined()
  const packagedHtml = Buffer.from(members[`${owner!}.html`]).toString("utf8")
  expect.soft(packagedHtml).toContain(newMarker)
  expect.soft(packagedHtml).not.toContain(oldMarker)
  expect.soft(packagedHtml).not.toContain("OLD_CORRECT_ANSWER")

  // Deactivation is allowed; historical removal or unrelated mutation is not.
  expect(history(EDITABLE_ACTIVITY_NODE, "p2").slice(0, oldActivity.length)).toEqual(oldActivity)
  expect(history("page-sectioning", "p2").slice(0, oldSource.length)).toEqual(oldSource)
  expect(history("web-rendering", "p2").slice(0, oldHtml.length)).toEqual(oldHtml)
  expect([history("page-sectioning", "p7"), history("web-rendering", "p7"), history(EDITABLE_ACTIVITY_NODE, "p7")]).toEqual(neighbor)
  expect(fs.readFileSync(path.join(dir, "images/p2_page.png")).equals(pixels)).toBe(true)
})

it("ordinary Sectioning reports unreadable retained pages while publishing unrelated missing work", async () => {
  const s = store()
  s.putNodeData("page-sectioning", "p2", null)
  s.putExtractedPage({ pageId: "p9", pageNumber: 9, text: "New source", images: [], pageImage: { imageId: "p9_page", buffer: Buffer.from("new pixels"), format: "png", hash: "new", width: 4, height: 6 } })
  s.putNodeData("image-filtering", "p9", { images: [] })
  s.close()
  const before = history("page-sectioning", "p2")
  const neighbor = history("page-sectioning", "p7")
  const messages: string[] = []
  const stop = bus.addListener(label, event => { if (event.type === "progress" && (event.data.type === "step-skip" || event.data.type === "step-complete") && event.data.message) messages.push(event.data.message) })
  const result = await run({ toStage: "sectioning" })
  expect(result.status).toBe("completed")
  stop()
  expect(messages).toContain("SECTIONING_INPUT_UNREADABLE: p2; total=1")
  const savedStatus = await (await app.request(`/books/${label}/step-status`)).json()
  expect(savedStatus.stepMessages["page-sectioning"]).toBe("SECTIONING_INPUT_UNREADABLE: p2; total=1")
  expect(history("page-sectioning", "p2")).toEqual(before)
  expect(history("page-sectioning", "p7")).toEqual(neighbor)
  expect(history("page-sectioning", "p9")).toHaveLength(1)
  expect(sectionPage).toHaveBeenCalledTimes(1)
})
it.each(["{invalid", "{}"])("invalid required part window is localized and never broadened: %s", async content => {
  const file = path.join(dir, "part.json")
  fs.writeFileSync(file, content)
  const before = [history("page-sectioning", "p2"), history("web-rendering", "p2")]
  for (const response of [await send("stages/run", { fromStage: "sectioning", toStage: "sectioning" }), await send("pages/p2/re-render", {})]) {
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "SECTIONING_WINDOW_INVALID" })
  }
  expect(fs.readFileSync(file, "utf8")).toBe(content)
  expect([history("page-sectioning", "p2"), history("web-rendering", "p2")]).toEqual(before)
  expect(sectionPage).not.toHaveBeenCalled(); expect(renderPage).not.toHaveBeenCalled()
  fs.unlinkSync(file) // Explicit fixture repair, never a production fallback.
  expect((await run({ toStage: "sectioning" })).status).toBe("completed")
})

it("aggregate page failures expose at most twenty IDs while retaining every page's diagnostic", async () => {
  const s = store()
  for (let n = 20; n < 45; n++) {
    const id = `p${n}`
    s.putExtractedPage({ pageId: id, pageNumber: n, text: "source", images: [], pageImage: { imageId: `${id}_page`, buffer: Buffer.from("pixels"), format: "png", hash: "pixels", width: 4, height: 6 } })
    s.putNodeData("page-sectioning", id, tree(id))
  }
  s.close()
  const before = [history("web-rendering", "p2"), history("web-rendering", "p7")]
  const errors: string[] = []
  const stop = bus.addListener(label, event => { if (event.type === "progress" && event.data.type === "step-error") errors.push(event.data.error) })
  renderPage.mockRejectedValue(new Error("controlled per-page failure detail"))
  const result = await run({ fromStage: "storyboard", pageErrorPolicy: "stop" })
  stop()
  expect(result.status).toBe("failed")
  expect(result.error).toContain("PIPELINE_PAGES_FAILED:")
  expect(result.error).toContain("total=27")
  expect(result.error?.match(/\bp\d+\b/g)).toHaveLength(20)
  expect(errors.filter(error => error.includes("controlled per-page failure detail"))).toHaveLength(27)
  expect(renderPage).toHaveBeenCalledTimes(27)
  expect([history("web-rendering", "p2"), history("web-rendering", "p7")]).toEqual(before)
})
