/** Real representative-book Validation repair loop. Work only on new disposable copies.
 * Provider transport is stubbed; admission, prompts, tasks, rendering, SQLite,
 * package/assessment publication, Preview and archive import are production paths.
 * node scripts/probes/spec-0009-acceptance.mjs SOURCE_BOOKS NEW_EVIDENCE_DIR
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { randomUUID, createHash } from "node:crypto"
import { createRequire } from "node:module"
import { copyBooks, hashes } from "./spec-0012-packaged-common.mjs"
import { createBookStorage, openBookDb } from "../../packages/storage/dist/index.js"
import { readValidationArtifact, validationArtifactHash } from "../../packages/pipeline/dist/index.js"
import { createPageRoutes } from "../../apps/api/dist/routes/pages.js"
import { createPackageRoutes } from "../../apps/api/dist/routes/package.js"
import { createReviewerValidationRoutes } from "../../apps/api/dist/routes/reviewer-validation.js"
import { createBookRoutes } from "../../apps/api/dist/routes/books.js"
import { createAdtPreviewRoutes } from "../../apps/api/dist/routes/adt-preview.js"
import { createTaskService } from "../../apps/api/dist/services/task-service.js"
import { createBookEventBus } from "../../apps/api/dist/services/book-event-bus.js"
import { bookWriterMiddleware } from "../../apps/api/dist/middleware/book-writer.js"
import { errorHandler } from "../../apps/api/dist/middleware/error-handler.js"

const [sourceBooks, evidenceDir] = process.argv.slice(2)
assert.ok(sourceBooks && evidenceDir, "Supply source books and a new evidence directory")
const out = path.resolve(evidenceDir), repo = path.resolve(import.meta.dirname, "../..")
assert.ok(!fs.existsSync(out), "Never overwrite previous evidence")
fs.mkdirSync(out, { recursive: true })
const books = path.join(out, "books"), original = copyBooks(sourceBooks, books)
const require = createRequire(path.join(repo, "apps/api/package.json")), { Hono } = require("hono")
const label = "momograde1", pageId = "pg005", book = path.join(books, label), prompts = path.join(repo, "prompts"), assets = path.join(repo, "assets/adt")
const config = path.join(out, "global.yaml")
fs.writeFileSync(config, "structure_types: {}\nrole_types:\n  text: Text\nreviewer_validation:\n  enabled: true\n")
const tasks = createTaskService(createBookEventBus(), books)
function appFor(root, taskService) {
  const app = new Hono(); app.onError(errorHandler); app.use("/books/:label/*", bookWriterMiddleware(root))
  app.route("/", createPageRoutes(root, prompts, assets, config, taskService))
  app.route("/", createPackageRoutes(root, assets, config, undefined, prompts))
  app.route("/", createReviewerValidationRoutes(root, path.join(repo, "config"), config))
  app.route("/", createAdtPreviewRoutes(root, assets, config, prompts))
  app.route("/", createBookRoutes(root, assets, config, undefined, undefined, prompts))
  return app
}
const app = appFor(books, tasks)
async function request(url, body, status = 200, target = app) {
  const response = await target.request(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-OpenAI-Key": "stub-only" }, body: JSON.stringify(body) })
  const content = await response.text(); assert.equal(response.status, status, `${url}: ${content}`); return JSON.parse(content)
}
function read(fn, root = books) { const s = createBookStorage(label, root); try { return fn(s) } finally { s.close() } }
function rows(root = books) { const db = openBookDb(path.join(root, label, `${label}.db`)); try { return db.all("SELECT * FROM node_data ORDER BY node, item_id, version") } finally { db.close() } }
const media = () => hashes(books, (file) => /^[^/]+\/(images|audio|fonts|videos)\//.test(file))
const report = { checks: [], requests: [], startedAt: new Date().toISOString() }
let suppliedHtml, suppliedAnswers
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), "https://api.openai.com/v1/chat/completions", "No live provider/network request permitted")
  const body = JSON.parse(String(init?.body)), prompt = JSON.stringify(body.messages)
  const answers = /correct answers|correct answer|answer key/i.test(prompt)
  report.requests.push({ model: body.model, kind: answers ? "answers" : "render", hash: createHash("sha256").update(String(init.body)).digest("hex") })
  const value = answers ? { reasoning: "Stubbed transport", answers: suppliedAnswers } : { reasoning: "Stubbed transport over actual representative source", content: suppliedHtml }
  return Response.json({ id: `stub-${report.requests.length}`, object: "chat.completion", created: 0, model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(value) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
}
try {
  const initial = await request(`/books/${label}/pages/${pageId}`)
  const section = initial.sectioningSynchronization.sections.find((entry) => entry.status === "current")
  assert.ok(section, "Use the reviewed SPEC-0012 generated representative fixture")
  const sectionId = section.sectionId
  const rendered = initial.rendering.sections.find((entry) => entry.html.includes(`data-section-id="${sectionId}"`))
  assert.ok(rendered)
  const generatedMarker = "SPEC-0009 accepted fresh rendering"
  suppliedHtml = rendered.html.replace('</section>', `<!-- ${generatedMarker} --></section>`)
  const generatedIds = [...suppliedHtml.matchAll(/data-id="([^\"]+_activity_[a-f0-9]{24})"/g)].map((match) => match[1])
  const replacements = new Map(generatedIds.map((id, index) => [id, `activity_gen_${index}`]))
  for (const [id, inputId] of replacements) suppliedHtml = suppliedHtml.replaceAll(id, inputId)
  suppliedAnswers = Object.entries(rendered.activityAnswers ?? {}).map(([id, value]) => ({ id: replacements.get(id) ?? id, value }))
  await request(`/books/${label}/package-adt?refreshValidation=true`, {})
  const artifact = readValidationArtifact(path.join(book, "adt")); assert.ok(artifact?.id)
  const target = artifact.sections.find((entry) => entry.sectionId === sectionId); assert.ok(target)
  const session = await request(`/books/${label}/validation/sessions`, { session_id: "phase-b-acceptance", reviewer_name: "Acceptance fixture reviewer" }, 201)
  const criterion = session.session.catalog_snapshot.pageSections[0].criteria[0].id
  const review = await request(`/books/${label}/validation/page-results`, { session_id: session.session.session_id, page_id: pageId, section_id: sectionId,
    artifact_id: artifact.id, href: target.href, results: [{ criterion_id: criterion, status: "needs-changes", comment: "Explicit review fixture: inspect generated HTML; task completion is not a pass." }] }, 201)
  const finding = { kind: "reviewer", sessionId: session.session.session_id, recordItemId: `${session.session.session_id}:${pageId}:default`, recordVersion: review.version, criterionId: criterion }
  const availability = await request(`/books/${label}/pages/${pageId}/render-tasks/availability?target=${encodeURIComponent(JSON.stringify({ sectionId, finding }))}`)
  assert.equal(availability.available, true, JSON.stringify(availability))
  const before = rows(), beforeMedia = media(), beforePackage = validationArtifactHash(path.join(book, "adt"))
  const requestBody = { requestId: randomUUID(), sectionId, finding, baseVersion: availability.baseVersion, renderingVersion: availability.renderingVersion }
  const accepted = await request(`/books/${label}/pages/${pageId}/render-tasks`, requestBody, 202)
  const duplicate = await request(`/books/${label}/pages/${pageId}/render-tasks`, requestBody)
  assert.equal(accepted.taskId, duplicate.taskId)
  const deadline = Date.now() + 120_000
  while (["queued", "running"].includes(tasks.getRequest(label, requestBody.requestId)?.status) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(tasks.getRequest(label, requestBody.requestId)?.status, "completed", JSON.stringify(tasks.getRequest(label, requestBody.requestId)))
  const count = report.requests.length; assert.ok(count > 0 && count <= 2, `Unexpected provider budget: ${count}`)
  assert.deepEqual(await request(`/books/${label}/pages/${pageId}/render-tasks`, requestBody), accepted)
  assert.equal(report.requests.length, count)
  const after = rows(), afterRows = new Map(after.map((row) => [JSON.stringify([row.node, row.item_id, row.version]), row]))
  for (const row of before) assert.deepEqual(afterRows.get(JSON.stringify([row.node, row.item_id, row.version])), row)
  assert.deepEqual(after.filter((row) => row.node === "web-rendering" && row.item_id !== pageId), before.filter((row) => row.node === "web-rendering" && row.item_id !== pageId))
  assert.deepEqual(after.filter((row) => /reviewer|accessibility-assessment/.test(row.node)), before.filter((row) => /reviewer|accessibility-assessment/.test(row.node)))
  assert.deepEqual(media(), beforeMedia); assert.equal(validationArtifactHash(path.join(book, "adt")), beforePackage)
  const editor = await request(`/books/${label}/pages/${pageId}`)
  assert.equal(editor.versions.rendering, initial.versions.rendering + 1)
  assert.ok(editor.rendering.sections.some(entry => entry.html.includes(generatedMarker)))
  report.checks.push("Synchronized proven activity repaired without artificial drift", "Actual transport counted; duplicate accepted request performs no extra provider work", "Immutable history, human/automated verdicts, all media and other rendering rows retained")
  const preview = await app.request(`/books/${label}/adt-preview/${sectionId}.html`)
  assert.equal(preview.status, 200)
  const previewHtml = await preview.text(); assert.ok(previewHtml.includes(generatedMarker))
  fs.writeFileSync(path.join(out, "preview.html"), previewHtml)
  await request(`/books/${label}/package-adt?refreshValidation=true`, {})
  const next = read((s) => s.getAllNodeVersions("accessibility-assessment", "book"))
  assert.ok(next.length > before.filter((row) => row.node === "accessibility-assessment" && row.data != null).length)
  assert.equal(next.at(-1).data.artifactHash, validationArtifactHash(path.join(book, "adt")))
  assert.deepEqual(read((s) => s.getLatestNodeData("reviewer-page-validation", finding.recordItemId)), { version: review.version, data: review.record })
  const packageHtml = fs.readFileSync(path.join(book, "adt", target.href), "utf8")
  assert.ok(packageHtml.includes(sectionId)); assert.ok(packageHtml.includes(generatedMarker)); fs.writeFileSync(path.join(out, "packaged.html"), packageHtml)
  report.checks.push("Preview/editor/new package use the repaired stable section", "Explicit validation publishes separate artifact evidence without changing human findings")
  const archive = await app.request(`/books/${label}/export-project`); assert.equal(archive.status, 200)
  const bytes = new Uint8Array(await archive.arrayBuffer()); fs.writeFileSync(path.join(out, `${label}.zip`), bytes)
  const importedBooks = path.join(out, "imported-books"); fs.mkdirSync(importedBooks)
  const importedApp = appFor(importedBooks)
  const form = new FormData(); form.append("zip", new File([bytes], `${label}.zip`, { type: "application/zip" }))
  const imported = await importedApp.request("/books/import", { method: "POST", body: form }); assert.equal(imported.status, 201, await imported.clone().text())
  assert.deepEqual(rows(importedBooks), rows())
  assert.deepEqual(hashes(path.join(importedBooks, label), (file) => /^(images|audio|fonts|videos)\//.test(file)), hashes(book, (file) => /^(images|audio|fonts|videos)\//.test(file)))
  report.checks.push("Production archive/import retains all evidence, source/render history and referenced assets")
  assert.deepEqual(hashes(sourceBooks), original); report.originalFilesUnchanged = true
  report.sectionId = sectionId; report.taskId = accepted.taskId; report.acceptedRequest = requestBody; report.artifactId = artifact.id
  report.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(book, "spec0009-acceptance.json"), JSON.stringify(report, null, 2))
  console.log("PASS", JSON.stringify(report))
} finally { globalThis.fetch = originalFetch }
