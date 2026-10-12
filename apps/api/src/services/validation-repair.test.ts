import { saveReviewerValidationSession, saveReviewerPageValidationRecord } from "./reviewer-validation-service.js"
import { stampValidationArtifact, writeValidationArtifact } from "../../../../packages/pipeline/src/validation-artifact.js"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { Hono } from "hono"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
import { stampGeneratedRendering, inputSignature, loadBookConfig } from "@adt/pipeline"
import { PageSectioningOutput, type ValidationRepairRequest } from "@adt/types"
import { createPageRoutes } from "../routes/pages.js"
import { createTaskRoutes } from "../routes/tasks.js"
import { createDebugRoutes } from "../routes/debug.js"
import { createTaskService } from "./task-service.js"
import { createBookEventBus } from "./book-event-bus.js"
import { errorHandler } from "../middleware/error-handler.js"
import { storedSynchronization } from "./storyboard-save.js"
import { validationRepairAvailability } from "./validation-repair.js"
import { runAccessibilityAssessment } from "@adt/pipeline"
import { buildBrowserAccessibilityRecheckPlan } from "../../../../packages/pipeline/src/browser-accessibility-assessment.js"

const label = "book", pageId = "pg001", sectionId = "pg001_sec009"
let root: string, config: string, app: Hono, tasks: ReturnType<typeof createTaskService>
const transport = vi.fn()
const neighbor = { sectionIndex: 0, sectionType: "text", reasoning: "manual", html: '<section data-section-id="pg001_sec003"><p>Retained manual sibling</p><img src="images/kept.png"></section>' }
function db<T>(fn: (storage: ReturnType<typeof createBookStorage>) => T): T {
  const storage = createBookStorage(label, root)
  try { return fn(storage) } finally { storage.close() }
}
function request(): ValidationRepairRequest { return { requestId: randomUUID(), sectionId, baseVersion: 1, renderingVersion: 1, finding: { kind: "violation", assessmentVersion: 1, ruleId: "heading-order" } } }
function post(body: ValidationRepairRequest) { return app.request(`/books/${label}/pages/${pageId}/render-tasks`, {
  method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "test" }, body: JSON.stringify(body),
}) }
function response() { return new Response(JSON.stringify({ id: "test", object: "chat.completion", created: 0, model: "gpt-4o-mini",
  choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ reasoning: "Repaired", content: `<section data-section-id="${sectionId}" data-section-type="text"><p data-id="text-9">Source</p></section>` }) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
}), { headers: { "Content-Type": "application/json" } }) }
function state() { return db((s) => ({ source: s.getAllNodeVersions("page-sectioning", pageId), render: s.getAllNodeVersions("web-rendering", pageId),
  neighbor: s.getAllNodeVersions("web-rendering", "pg002"), translation: s.getAllNodeVersions("text-catalog-translation", "es"),
  assessment: s.getAllNodeVersions("accessibility-assessment", "book").filter((v) => v.data != null),
  asset: createHash("sha256").update(fs.readFileSync(path.join(s.bookDir!, "images/kept.png"))).digest("hex"),
})) }
function cache() {
  const dir = path.join(root, label, ".cache")
  return fs.existsSync(dir) ? Object.fromEntries(fs.readdirSync(dir).map((name) => [name, fs.readFileSync(path.join(dir, name), "utf8")])) : {}
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "validation-repair-")); config = path.join(root, "global.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n"); transport.mockReset(); vi.stubGlobal("fetch", transport)
  db((s) => {
    for (const [id, n] of [[pageId, 1], ["pg002", 2]] as const) s.putExtractedPage({ pageId: id, pageNumber: n, text: "Source", images: [],
      pageImage: { imageId: `${id}_page`, buffer: Buffer.from("retained-image"), format: "png", hash: "image", width: 100, height: 100 } })
    const source = PageSectioningOutput.parse({ reasoning: "Source", sections: [3, 9].map((n) => ({ sectionId: `pg001_sec00${n}`, sectionType: "text", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false,
      nodes: [{ nodeId: `text-${n}`, role: "text", text: "Source", isPruned: false }] })) })
    s.putNodeData("page-sectioning", pageId, source)
    s.putNodeData("page-sectioning", "pg002", { ...source, sections: [] })
    const rendering = stampGeneratedRendering({ sections: [neighbor, { sectionIndex: 77, sectionType: "text", reasoning: "generated", html: `<section data-section-id="${sectionId}" data-section-type="text"><p data-id="text-9">Source</p></section>` }] }, source, pageId, 1, [sectionId])
    s.putNodeData("web-rendering", pageId, rendering); s.putNodeData("web-rendering", "pg002", { retained: "unknown" })
    s.putNodeData("text-catalog-translation", "es", { manual: "unrelated content" })
    fs.writeFileSync(path.join(s.bookDir!, "images/kept.png"), "manual referenced asset")
    s.putNodeData("accessibility-assessment", "book", { generatedAt: "2026-10-12T00:00:00Z", tool: "axe-core", runOnlyTags: [], disabledRules: [],
      artifact: { sections: [{ pageId, sectionId, href: `${sectionId}.html`, sourceVersion: 1, renderingVersion: 1,
        sourceHash: inputSignature(source), renderingHash: inputSignature(rendering), artifactHash: "a".repeat(64) }] },
      summary: { pageCount: 1, pagesWithViolations: 1, pagesWithErrors: 0, violationCount: 1, incompleteCount: 1 },
      pages: [{ pageId, sectionId, href: `${sectionId}.html`, pageNumber: 1, title: "Test", violationCount: 1, incompleteCount: 1, passCount: 0, inapplicableCount: 0,
        violations: [{ id: "heading-order", impact: "moderate", description: "Heading order", help: "Review", helpUrl: "", tags: [], nodes: [] }],
        incomplete: [{ id: "color-contrast", impact: null, description: "Contrast review", help: "Review", helpUrl: "", tags: [], nodes: [] }] }],
    })
  })
  writeSectioningLifecycle(path.join(root, label), "dynamic", true)
  fs.writeFileSync(path.join(root, label, "config.yaml"), "default_model: openai:gpt-4o-mini\ndefault_render_strategy: llm\nrender_strategies:\n  llm:\n    render_type: llm\n    config:\n      prompt: web_generation_html\n      max_retries: 0\n      visual_refinement:\n        enabled: false\n")
  tasks = createTaskService(createBookEventBus(), root); app = new Hono(); app.onError(errorHandler)
  app.route("/", createPageRoutes(root, path.resolve("prompts"), path.resolve("assets/adt"), config, tasks))
  app.route("/", createTaskRoutes(tasks)); app.route("/", createDebugRoutes(root, path.resolve("prompts"), config))
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })
async function terminal(id: string) { await vi.waitFor(() => expect(["completed", "failed", "cancelled"]).toContain(tasks.getRequest!(label, id)?.status)) }

it("repairs synchronized generated output through the API once, preserving verdicts, history, siblings and assets", async () => {
  expect(db((s) => storedSynchronization(s, pageId, "reflowable")).sections.find((s) => s.sectionId === sectionId)?.action).toBe("none")
  const body = request(), before = state(); let release!: (r: Response) => void
  transport.mockImplementationOnce(() => new Promise<Response>((r) => { release = r }))
  const accepted = await post(body); expect(accepted.status).toBe(202); const receipt = await accepted.json()
  await vi.waitFor(() => expect(transport, JSON.stringify(tasks.getRequest!(label, body.requestId))).toHaveBeenCalledTimes(1))
  expect((await (await post(body)).json())).toEqual(receipt)
  expect((await post(request())).status).toBe(409) // Live task, no step row.
  release(response()); await terminal(body.requestId)
  expect(tasks.getRequest!(label, body.requestId)?.status).toBe("completed")
  expect((await (await post(body)).json())).toEqual(receipt); expect(transport).toHaveBeenCalledTimes(1)
  const after = state(); expect(after.source).toEqual(before.source); expect(after.neighbor).toEqual(before.neighbor)
  expect(after.translation).toEqual(before.translation); expect(after.asset).toEqual(before.asset); expect(after.assessment).toEqual(before.assessment)
  expect(after.render).toHaveLength(2); expect((after.render.at(-1)!.data as any).sections[0]).toEqual(neighbor)
  expect(Object.keys(cache()).length).toBeGreaterThan(0)
  const historic = await app.request(`/books/${label}/debug/accessibility?assessment=2026-10-12T00%3A00%3A00Z`)
  expect((await historic.json()).assessment.pages[0].violations[0].id).toBe("heading-order")
  const newer = request(); expect((await post(newer)).status).toBe(409)
})
it.each(["manual", "unknown", "custom", "retired", "duplicate", "fixed", "legacy", "stale"])("rejects %s target before accepting paid work", async (kind) => {
  const body = request()
  db((s) => {
    const source = s.getLatestNodeData("page-sectioning", pageId)!, rendering = s.getLatestNodeData("web-rendering", pageId)!, assessment = s.getLatestNodeData("accessibility-assessment", "book")!
    if (kind === "legacy") { delete (assessment.data as any).artifact }
    if (kind === "fixed") s.putNodeData("fixed-layout-sectioning", pageId, { positioned: true })
    if (["manual", "unknown"].includes(kind)) {
      const section = (rendering.data as any).sections[1]; section.generationEvidence = kind === "manual" ? { source: "manual" } : undefined
      body.renderingVersion = s.putNodeData("web-rendering", pageId, rendering.data)
    }
    if (["custom", "retired", "duplicate"].includes(kind)) {
      const section = (source.data as any).sections[1]
      if (kind === "custom") section.sectionType = "activity_custom_widget"
      if (kind === "retired") section.isPruned = true
      if (kind === "duplicate") (source.data as any).sections.push(section)
      body.baseVersion = s.putNodeData("page-sectioning", pageId, source.data)
    }
    if (kind !== "stale" && kind !== "legacy") {
      const snapshot = (assessment.data as any).artifact.sections[0]
      snapshot.sourceVersion = body.baseVersion; snapshot.renderingVersion = body.renderingVersion
      snapshot.sourceHash = inputSignature(source.data); snapshot.renderingHash = inputSignature(rendering.data)
    }
    if (kind === "stale") body.baseVersion = 99
    body.finding = { kind: "violation", assessmentVersion: s.putNodeData("accessibility-assessment", "book", assessment.data), ruleId: "heading-order" }
  })
  const before = state(), result = await post(body)
  expect(result.status, await result.text()).toBe(409); expect(transport).not.toHaveBeenCalled()
  expect(tasks.getRequest!(label, body.requestId)).toBeUndefined(); expect(state()).toEqual(before)
})
it("keeps incomplete findings distinct, rejects forged rule references and does not trust a client origin flag", async () => {
  const body = request(); body.finding = { kind: "incomplete", assessmentVersion: 1, ruleId: "heading-order" }
  expect((await post(body)).status).toBe(409)
  body.finding = { kind: "incomplete", assessmentVersion: 1, ruleId: "color-contrast" }
  const available = db((s) => validationRepairAvailability(s, pageId, body, loadBookConfig(label, root, config)))
  expect(available.available).toBe(true); expect(transport).not.toHaveBeenCalled()
})
it("retains cache, content and evidence on cancellation and an external stale-input race", async () => {
  for (const kind of ["cancel", "race"] as const) {
    const body = request(), before = state(), oldCache = cache(); let release!: (r: Response) => void
    transport.mockImplementationOnce(() => new Promise<Response>((r) => { release = r }))
    const accepted = await post(body); expect(accepted.status).toBe(202); const { taskId } = await accepted.json()
    await vi.waitFor(() => expect(release, JSON.stringify(tasks.getRequest!(label, body.requestId))).toBeTypeOf("function"))
    if (kind === "cancel") expect(tasks.cancelTask!(label, taskId)).toBe(true)
    else db((s) => { s.putNodeData("page-sectioning", pageId, { ...(before.source[0].data as object), reasoning: "External race" }) })
    release(response()); await terminal(body.requestId)
    expect(tasks.getRequest!(label, body.requestId)?.status).toBe(kind === "cancel" ? "cancelled" : "failed")
    const after = state(); expect(after.render).toEqual(before.render); expect(after.asset).toEqual(before.asset)
    expect(after.assessment).toEqual(before.assessment); expect(after.translation).toEqual(before.translation); expect(cache()).toEqual(oldCache)
  }
  expect(transport).toHaveBeenCalledTimes(2)
})

it("does not create a book for read or write repair requests to nonexistent labels", async () => {
  const before = fs.readdirSync(root).sort(), body = request()
  const read = await app.request(`/books/missing/pages/${pageId}/render-tasks/availability?target=${encodeURIComponent(JSON.stringify(body))}`)
  const write = await app.request(`/books/missing/pages/${pageId}/render-tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  expect(read.status).toBe(404); expect(write.status).toBe(404); expect(fs.readdirSync(root).sort()).toEqual(before)
})
it("retains warmed valid cache when a second force-fresh provider response loses publication admission", async () => {
  const first = request(); transport.mockResolvedValueOnce(response()); expect((await post(first)).status).toBe(202); await terminal(first.requestId)
  expect(tasks.getRequest!(label, first.requestId)?.status).toBe("completed")
  const second = request()
  db((s) => {
    const rendering = s.getLatestNodeData("web-rendering", pageId)!, source = s.getLatestNodeData("page-sectioning", pageId)!
    const old = state().assessment[0].data as any, next = structuredClone(old)
    next.generatedAt = "2026-10-12T00:01:00Z"; next.artifact.sections[0].renderingVersion = rendering.version; next.artifact.sections[0].renderingHash = inputSignature(rendering.data)
    next.artifact.sections[0].sourceVersion = source.version; next.artifact.sections[0].sourceHash = inputSignature(source.data)
    const version = s.putNodeData("accessibility-assessment", "book", next)
    second.finding = { kind: "violation", assessmentVersion: version, ruleId: "heading-order" }; second.renderingVersion = rendering.version
  })
  const warmed = cache(), before = state(); expect(Object.keys(warmed).length).toBeGreaterThan(0)
  transport.mockImplementationOnce(async () => { db((s) => { s.putNodeData("page-sectioning", pageId, { ...(before.source[0].data as object), reasoning: "Race" }) }); return response() })
  expect((await post(second)).status).toBe(202); await terminal(second.requestId)
  expect(tasks.getRequest!(label, second.requestId)?.status).toBe("failed"); expect(transport).toHaveBeenCalledTimes(2)
  expect(cache()).toEqual(warmed); expect(state().render).toEqual(before.render); expect(state().asset).toEqual(before.asset)
})

it("a semantics-only repair leaves unrelated completed downstream step rows byte-for-byte unchanged", async () => {
  const steps = ["catalog-translation", "image-captioning", "easy-read", "core-tts-catalog", "tts", "word-timestamps"] as const
  db((s) => steps.forEach((step) => s.markStepCompleted(step)))
  const before = db((s) => s.getStepRuns().filter((run) => (steps as readonly string[]).includes(run.step)))
  const body = request(); transport.mockResolvedValueOnce(response())
  expect((await post(body)).status).toBe(202); await terminal(body.requestId)
  expect(tasks.getRequest!(label, body.requestId)).toMatchObject({ status: "completed" })
  expect(db((s) => s.getStepRuns().filter((run) => (steps as readonly string[]).includes(run.step)))).toEqual(before)
})


it("repairs a persisted human finding from its reviewed artifact without changing the session, verdict or record history", async () => {
  const artifactId = db((s) => {
    const adt = path.join(s.bookDir!, "adt"), entries = [{ section_id: sectionId, href: `${sectionId}.html` }]
    fs.mkdirSync(path.join(adt, "content"), { recursive: true })
    fs.writeFileSync(path.join(adt, "content/pages.json"), JSON.stringify(entries))
    fs.writeFileSync(path.join(adt, entries[0].href), `<html><head><title>Review</title></head><body>Actual reviewed page</body></html>`)
    const id = stampValidationArtifact(adt, entries); writeValidationArtifact(s, adt, entries, id); return id
  })
  saveReviewerValidationSession(label, root, { session_id: "human", reviewer_name: "Reviewer" })
  const saved = saveReviewerPageValidationRecord(label, root, { session_id: "human", page_id: pageId, section_id: sectionId,
    artifact_id: artifactId, href: `${sectionId}.html`, results: [{ criterion_id: "reading", status: "needs-changes" }] })
  const item = `human:${pageId}:default`, original = db((s) => ({ records: s.getAllNodeVersions("reviewer-page-validation", item), session: s.getAllNodeVersions("reviewer-validation-session", "human") }))
  const body = request(); body.finding = { kind: "reviewer", sessionId: "human", recordItemId: item, recordVersion: saved.version, criterionId: "reading" }
  expect(db((s) => validationRepairAvailability(s, pageId, body, loadBookConfig(label, root, config)))).toMatchObject({ available: true })
  // A package-only change keeps source/render versions but makes A historical.
  const manifest = path.join(root, label, "adt", ".validation-inputs.json")
  const originalManifest = fs.readFileSync(manifest, "utf8")
  fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(originalManifest), id: randomUUID() }))
  expect(db((s) => validationRepairAvailability(s, pageId, body, loadBookConfig(label, root, config)))).toMatchObject({ available: false, reason: "historical" })
  fs.writeFileSync(manifest, originalManifest)
  transport.mockResolvedValueOnce(response())
  expect((await post(body)).status).toBe(202); await terminal(body.requestId)
  expect(tasks.getRequest!(label, body.requestId)?.status).toBe("completed")
  expect(transport).toHaveBeenCalledTimes(1)
  expect(db((s) => ({ records: s.getAllNodeVersions("reviewer-page-validation", item), session: s.getAllNodeVersions("reviewer-validation-session", "human") }))).toEqual(original)
  expect(db((s) => validationRepairAvailability(s, pageId, body, loadBookConfig(label, root, config)))).toMatchObject({ available: false, reason: "historical" })
})

it("binds moved stable sections to packaged ownership for automated and explicit human repair", async () => {
  const movedPage = "pg002", entries = [{ section_id: sectionId, href: `${sectionId}.html` }]
  const adt = path.join(root, label, "adt")
  const artifactId = db(s => {
    const source = structuredClone(s.getLatestNodeData("page-sectioning", pageId)!.data) as any
    const selected = source.sections.pop()
    s.putNodeData("page-sectioning", pageId, source)
    const moved = { ...source, sections: [selected] }
    const sourceVersion = s.putNodeData("page-sectioning", movedPage, moved)
    const rendering = s.getLatestNodeData("web-rendering", pageId)!.data as any
    const section = rendering.sections.pop()
    s.putNodeData("web-rendering", pageId, rendering)
    s.putNodeData("web-rendering", movedPage, stampGeneratedRendering({ sections: [section] }, moved, movedPage, sourceVersion))
    fs.mkdirSync(path.join(adt, "content"), { recursive: true })
    fs.writeFileSync(path.join(adt, "content/pages.json"), JSON.stringify(entries))
    fs.writeFileSync(path.join(adt, entries[0].href), '<html lang="en"><head><title>Moved</title></head><body><main><img src="missing.png"></main></body></html>')
    const id = stampValidationArtifact(adt, entries, s); writeValidationArtifact(s, adt, entries, id); return id
  })
  expect(fs.readFileSync(path.join(adt, entries[0].href), "utf8")).toContain('<meta name="adt-validation-page" content="pg002">')
  const assessment = await runAccessibilityAssessment({ bookDir: path.join(root, label), config: { run_only_tags: ["wcag2a"], disabled_rules: [] } })
  expect(assessment.pages[0]).toMatchObject({ pageId: movedPage, sectionId })
  expect(assessment.pages[0].violations.some(rule => rule.id === "image-alt")).toBe(true)
  expect(buildBrowserAccessibilityRecheckPlan(entries, assessment)[0].pageId).toBe(movedPage)
  const version = db(s => s.putNodeData("accessibility-assessment", "book", assessment))
  const finding = { kind: "violation" as const, assessmentVersion: version, ruleId: "image-alt" }
  expect(db(s => validationRepairAvailability(s, movedPage, { sectionId, finding }, loadBookConfig(label, root, config)))).toMatchObject({ available: true })
  expect(db(s => validationRepairAvailability(s, pageId, { sectionId, finding }, loadBookConfig(label, root, config)))).toMatchObject({ available: false })
  saveReviewerValidationSession(label, root, { session_id: "moved", reviewer_name: "Reviewer" })
  const saved = saveReviewerPageValidationRecord(label, root, { session_id: "moved", page_id: movedPage, section_id: sectionId,
    artifact_id: artifactId, href: entries[0].href, results: [{ criterion_id: "reading", status: "needs-changes" }] })
  const body = { ...request(), baseVersion: 2, renderingVersion: 2,
    finding: { kind: "reviewer" as const, sessionId: "moved", recordItemId: `moved:${movedPage}:default`, recordVersion: saved.version, criterionId: "reading" } }
  transport.mockResolvedValueOnce(response())
  const accepted = await app.request(`/books/${label}/pages/${movedPage}/render-tasks`, { method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "test" }, body: JSON.stringify(body) })
  expect(accepted.status, await accepted.clone().text()).toBe(202); await terminal(body.requestId)
  expect(tasks.getRequest!(label, body.requestId)?.status).toBe("completed")
  expect(transport).toHaveBeenCalledTimes(1)
  expect(db(s => s.getLatestNodeData("reviewer-page-validation", body.finding.recordItemId))).toEqual({ version: saved.version, data: saved.record })
})
