/**
 * Disposable representative-book acceptance. Build apps/api first, then:
 * node scripts/probes/spec-0012-acceptance.mjs --source-book /path/momograde1 \
 *   --fixed-book /path/spec3-b1-acceptance --out /new/evidence/directory
 *
 * Originals are never opened with storage or changed. The activity is explicitly
 * a newly generated acceptance variant of real book content: model transport is
 * stubbed, while prompts, validation, protection, publication, saves, preview,
 * packaging and archive/import use production code. Legacy matching HTML is
 * never relabeled as generated. No real provider request is allowed.
 */
import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { createBookStorage, openBookDb } from "../../packages/storage/dist/index.js"
import { loadBookConfig, packageAdtWeb, isFixedLayoutBook } from "../../packages/pipeline/dist/index.js"
import { createPageRoutes } from "../../apps/api/dist/routes/pages.js"
import { createBookRoutes } from "../../apps/api/dist/routes/books.js"
import { createOutputRoutes } from "../../apps/api/dist/routes/outputs.js"
import { createAdtPreviewRoutes } from "../../apps/api/dist/routes/adt-preview.js"
import { createStageRunner } from "../../apps/api/dist/services/stage-runner.js"
import { errorHandler } from "../../apps/api/dist/middleware/error-handler.js"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(path.join(repo, "apps/api/package.json"))
const { Hono } = require("hono")
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, values) => index % 2 ? pairs : [...pairs, [item, values[index + 1]]], []))
for (const key of ["--source-book", "--fixed-book", "--out"]) assert.ok(args[key], `Required: ${key}`)
const out = path.resolve(args["--out"])
assert.ok(!fs.existsSync(out), "The evidence directory must be new; existing work is never removed")
const sourcePaths = [path.resolve(args["--source-book"]), path.resolve(args["--fixed-book"])]
for (const source of sourcePaths) assert.ok(!out.startsWith(`${source}${path.sep}`), "Evidence must be outside source books")
fs.mkdirSync(out, { recursive: true })
const booksDir = path.join(out, "books")
const importedDir = path.join(out, "imported-books")
fs.mkdirSync(booksDir)
fs.mkdirSync(importedDir)
const labels = sourcePaths.map((folder) => path.basename(folder))
const promptsDir = path.join(repo, "prompts")
const webAssetsDir = path.join(repo, "assets/adt")
const configPath = path.join(out, "global.yaml")
fs.writeFileSync(configPath, "default_model: openai:gpt-4o-mini\nstructure_types: {}\nrole_types:\n  text: Text\noutput_languages: [en]\ncore_tts:\n  language_normalization: false\n  latex_to_speech: false\n")
const report = { startedAt: new Date().toISOString(), booksDir, importedDir, originalFilesUnchanged: false, providerRequests: [], checks: [], browser: [] }
const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex")
function hashes(folder, predicate = () => true) {
  const result = {}
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name), relative = path.relative(folder, file)
      if (item.isDirectory()) walk(file)
      else if (item.isFile() && predicate(relative)) result[relative] = digest(fs.readFileSync(file))
    }
  }
  walk(folder)
  return result
}
const originalHashes = sourcePaths.map((folder) => hashes(folder))
for (const [index, source] of sourcePaths.entries()) fs.cpSync(source, path.join(booksDir, labels[index]), { recursive: true, errorOnExist: true })
const assets = (label, root = booksDir) => hashes(path.join(root, label), (name) => /^(images|audio|fonts|videos)\//.test(name))
function storageRead(label, fn, root = booksDir) {
  const storage = createBookStorage(label, root)
  try { return fn(storage) } finally { storage.close() }
}
function rows(label, root = booksDir) {
  const db = openBookDb(path.join(root, label, `${label}.db`))
  try { return { nodes: db.all("SELECT * FROM node_data ORDER BY node, item_id, version"), current: db.all("SELECT * FROM node_current ORDER BY node, item_id") } }
  finally { db.close() }
}
function appFor(root = booksDir) {
  const app = new Hono()
  app.onError(errorHandler)
  app.route("/", createPageRoutes(root, promptsDir, webAssetsDir, configPath))
    .route("/", createOutputRoutes(root, promptsDir, configPath))
    .route("/", createAdtPreviewRoutes(root, webAssetsDir, configPath, promptsDir))
    .route("/", createBookRoutes(root, webAssetsDir, configPath, undefined, undefined, promptsDir))
  return app
}
async function json(app, url, body, method = "PUT") {
  const response = await app.request(url, body === undefined ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const text = await response.text()
  assert.equal(response.status, 200, `${method} ${url}: ${text}`)
  return JSON.parse(text)
}
const page = (app, label, id) => json(app, `/books/${label}/pages/${id}`)
async function save(app, label, id, tree, versions) {
  return json(app, `/books/${label}/pages/${id}/sectioning`, { ...tree, baseVersion: versions.sectioning, renderingVersion: versions.rendering ?? 0 })
}
function leaves(nodes) { return nodes.flatMap((node) => [node, ...leaves(node.children ?? [])]).filter((node) => !node.isPruned && node.role && node.role !== "image" && node.text) }
async function preview(app, label, id) {
  const response = await app.request(`/books/${label}/adt-preview/${id}.html`)
  const html = await response.text()
  assert.equal(response.status, 200, `Preview ${label}/${id}: ${html}`)
  return html
}
async function packaged(label, id) {
  const storage = createBookStorage(label, booksDir)
  try {
    const config = loadBookConfig(label, booksDir, configPath)
    await packageAdtWeb(storage, { bookDir: storage.bookDir, label, language: "en", outputLanguages: ["en"], title: "SPEC-0012 acceptance", webAssetsDir,
      config, fixedLayout: isFixedLayoutBook(config), configDir: path.join(repo, "config"), promptsDir, features: { readAloud: false, quizzes: false, glossary: false } })
    return fs.readFileSync(path.join(storage.bookDir, "adt", `${id}.html`), "utf8")
  } finally { storage.close() }
}
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
let suppliedHtml = ""
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/api\.openai\.com\/v1\/chat\/completions$/, "Network is disabled except the stubbed model transport")
  const request = JSON.parse(String(init?.body))
  const text = JSON.stringify(request.messages)
  const answer = /correct answers|correct answer|answer key/i.test(text) && report.providerRequests.length % 2 === 1
  const value = answer ? { reasoning: "Acceptance stub answer, no external provider", answers: [{ id: "item-1", value: "tree" }, { id: "activity_gen_word", value: "tree" }] }
    : { reasoning: "New generation from representative-book source at a stubbed provider transport", content: suppliedHtml }
  report.providerRequests.push({ url: String(url), model: request.model, requestHash: digest(JSON.stringify(request)), kind: answer ? "activity-answers" : "activity-rendering" })
  return Response.json({ id: `acceptance-${report.providerRequests.length}`, object: "chat.completion", created: 0, model: request.model,
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(value) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
}

try {
  const app = appFor()
  const label = labels[0], targetPage = "pg005", legacyPage = "pg006"
  const retainedAssets = assets(label)
  const initial = await page(app, label, legacyPage)
  assert.equal(initial.sectioningSynchronization.sections[0].status, "unknown-origin")
  const legacyEdit = structuredClone(initial.sectioningTree)
  leaves(legacyEdit.sections[0].nodes)[0].text += " Legacy acceptance edit."
  const beforeLegacy = rows(label)
  const legacyResult = await save(app, label, legacyPage, legacyEdit, initial.versions)
  const legacy = await page(app, label, legacyPage)
  assert.equal(legacyResult.synchronization.sections[0].status, "unknown-origin")
  assert.deepEqual(legacy.rendering, initial.rendering)
  assert.equal(report.providerRequests.length, 0)
  const afterLegacy = rows(label)
  assert.deepEqual(afterLegacy.nodes.filter((row) => row.node === "web-rendering"), beforeLegacy.nodes.filter((row) => row.node === "web-rendering"))
  assert.deepEqual(assets(label), retainedAssets)
  report.checks.push({ name: "Real legacy semantic Save retains rendering/history/assets and unknown-origin drift", passed: true, pageId: legacyPage, versions: legacy.versions })

  // Limit explicit regeneration to one real source page. Run actual Sectioning
  // with a captured replacement decision so lifecycle readiness is earned by
  // the shared worker, never invented for a historical book.
  const bookConfig = path.join(booksDir, label, "config.yaml")
  fs.copyFileSync(bookConfig, path.join(booksDir, label, "acceptance-original-config.yaml"))
  fs.writeFileSync(bookConfig, "default_model: openai:gpt-4o-mini\nstart_page: 5\nend_page: 5\npage_sectioning:\n  mode: page\nsection_render_strategies: {}\ndefault_render_strategy: acceptance_activity\nrender_strategies:\n  acceptance_activity:\n    render_type: activity\n    config:\n      prompt: activity_fill_in_the_blank\n      answer_prompt: activity_fill_in_the_blank_answers\n      model: openai:gpt-4o-mini\n      max_retries: 0\n      visual_refinement:\n        enabled: false\n")
  async function runStage(stage, bookLabel = label, selectedPage = targetPage, replace = true) {
    const { outputs } = await json(app, `/books/${bookLabel}/outputs`)
    const selected = outputs.find((entry) => entry.identity.kind === stage && entry.identity.id === selectedPage)
    assert.ok(selected, `Missing ${stage} status`)
    const events = []
    await createStageRunner().run(bookLabel, { booksDir, promptsDir, configPath, fromStage: stage, toStage: stage,
      credentials: { openai: { apiKey: "acceptance-stub-only" } },
      outputScope: { selection: { pageIds: [selectedPage] }, ...(replace ? { replace: [{ identity: selected.identity, signature: selected.signature, contentHash: selected.contentHash }] } : {}) },
    }, { emit(event) { events.push(event) } })
    assert.deepEqual(events.filter((event) => event.type === "step-error"), [], `${stage}: ${JSON.stringify(events)}`)
    fs.writeFileSync(path.join(out, `${bookLabel}-${stage}-events.json`), JSON.stringify(events, null, 2))
  }
  await runStage("sectioning")
  let current = await page(app, label, targetPage)
  const activityTree = structuredClone(current.sectioningTree)
  const section = activityTree.sections.find((entry) => !entry.isPruned)
  section.sectionType = "activity_fill_in_the_blank"
  const editableLeaf = leaves(section.nodes)[0]
  editableLeaf.text += " Complete the word: ___."
  await save(app, label, targetPage, activityTree, current.versions)
  const renderNodes = (nodes) => nodes.filter((node) => !node.isPruned).map((node) => node.role === "image"
    ? `<img data-id="${node.nodeId}" src="/api/books/${label}/images/${node.nodeId}" alt="" />`
    : node.children ? `<div>${renderNodes(node.children)}</div>`
      : `<p data-id="${node.nodeId}" class="adt-body">${escape(node.text ?? "").replace("___", "[[blank:item-1]]")}</p>`).join("")
  suppliedHtml = `<section data-section-id="${section.sectionId}" data-section-type="${section.sectionType}" class="p-8 bg-white">${renderNodes(section.nodes)}<button type="button" data-id="activity_gen_word" data-answer-id="activity_gen_word" class="word-choice">tree</button><button type="button" data-id="activity_gen_check" aria-controls="activity_gen_word">Check</button></section>`
  await runStage("storyboard")
  current = await page(app, label, targetPage)
  assert.equal(current.sectioningSynchronization.sections.find((entry) => entry.sectionId === section.sectionId)?.status, "current")
  assert.equal(current.rendering.sections[0].generationEvidence.source, "ai")
  const generatedActivityIds = [...current.rendering.sections[0].html.matchAll(/data-id="([^\"]+_activity_[a-f0-9]{24})"/g)].map((match) => match[1])
  assert.equal(generatedActivityIds.length, 2, "The production renderer must mint scoped generated control identities")
  const generatedAnswerId = Object.keys(current.rendering.sections[0].activityAnswers).find((id) => generatedActivityIds.includes(id))
  assert.ok(generatedAnswerId, "The production renderer must remap generated answer identities")
  const beforeSaveRows = rows(label), beforeSaveAssets = assets(label), beforeSaveCalls = report.providerRequests.length
  const textEdit = structuredClone(current.sectioningTree)
  const editedLeaf = leaves(textEdit.sections[0].nodes).find((node) => node.nodeId === editableLeaf.nodeId)
  editedLeaf.text = editedLeaf.text.replace("Complete the word", "Finish the word safely & carefully")
  const committed = await save(app, label, targetPage, textEdit, current.versions)
  assert.equal(committed.synchronization.sections[0].status, "text-patched")
  assert.equal(report.providerRequests.length, beforeSaveCalls)
  const saved = await page(app, label, targetPage)
  const afterSaveRows = rows(label)
  assert.deepEqual(afterSaveRows.nodes.filter((row) => row.item_id !== targetPage && row.node !== "text-catalog"), beforeSaveRows.nodes.filter((row) => row.item_id !== targetPage && row.node !== "text-catalog"))
  assert.deepEqual(assets(label), beforeSaveAssets)
  const previewHtml = await preview(app, label, section.sectionId)
  const packageHtml = await packaged(label, section.sectionId)
  for (const html of [saved.rendering.sections[0].html, previewHtml, packageHtml]) {
    assert.match(html, /Finish the word safely &amp; carefully/)
    assert.match(html, /\[\[blank:item-1\]\]/)
    for (const id of generatedActivityIds) assert.ok(html.includes(`data-id="${id}"`), "Generated control identity must survive Save and packaging")
    assert.ok(html.includes(`data-answer-id="${generatedAnswerId}"`))
    assert.ok(html.includes(`aria-controls="${generatedAnswerId}"`))
  }
  assert.equal(saved.rendering.sections[0].html, current.rendering.sections[0].html.replace("Complete the word", "Finish the word safely &amp; carefully"))
  assert.deepEqual(saved.rendering.sections[0].activityAnswers, current.rendering.sections[0].activityAnswers)
  assert.ok(Object.keys(saved.rendering.sections[0].activityAnswers ?? {}).length > 0, "Generated activity answers must be retained")
  fs.writeFileSync(path.join(out, "activity-preview.html"), previewHtml)
  fs.writeFileSync(path.join(out, "activity-packaged.html"), packageHtml)
  report.checks.push({ name: "Real-source newly generated activity: atomic zero-call text patch and preview/package parity", passed: true,
    pageId: targetPage, sectionId: section.sectionId, leafId: editableLeaf.nodeId, generatedActivityIds, generatedAnswerId, generationRequests: beforeSaveCalls, saveRequests: report.providerRequests.length - beforeSaveCalls, versions: saved.versions,
    provenance: "New production rendering at stubbed provider transport; original legacy HTML was explicitly replaced in a disposable copy and retained in history." })
  report.browser.push({ label, pageId: targetPage, sectionId: section.sectionId, kind: "generated reflowable activity" }, { label, pageId: legacyPage, kind: "retained unknown-origin legacy drift" })

  const fixedLabel = labels[1], fixedPage = "pg001"
  // This historical fixture intentionally retained a stale lifecycle. The
  // shared worker revalidates protected Sectioning without replacing it, then
  // explicitly regenerates the positioned rendering from retained extraction.
  const fixedRecoveryPage = await page(app, fixedLabel, fixedPage)
  const retainedFixedSource = structuredClone(fixedRecoveryPage.sectioningTree)
  retainedFixedSource.reasoning += " Acceptance: retain these manually reviewed semantic inputs."
  await save(app, fixedLabel, fixedPage, retainedFixedSource, fixedRecoveryPage.versions)
  const fixedSourceBeforeRecovery = storageRead(fixedLabel, (storage) => storage.getLatestNodeData("page-sectioning", fixedPage))
  await runStage("sectioning", fixedLabel, fixedPage, false)
  await runStage("storyboard", fixedLabel, fixedPage, true)
  assert.deepEqual(storageRead(fixedLabel, (storage) => storage.getLatestNodeData("page-sectioning", fixedPage)), fixedSourceBeforeRecovery)
  const fixedBefore = await page(app, fixedLabel, fixedPage)
  const fixedTree = storageRead(fixedLabel, (storage) => storage.getLatestNodeData("fixed-layout-sectioning", fixedPage))
  assert.ok(fixedTree?.data?.sections?.[0]?.placement, "A genuine positioned tree is required")
  const fixedId = fixedTree.data.sections[0].sectionId
  const beforeFixedPackage = await packaged(fixedLabel, fixedId), beforeFixedAssets = assets(fixedLabel)
  const fixedEdit = structuredClone(fixedBefore.sectioningTree)
  leaves(fixedEdit.sections[0].nodes)[0].text += " Semantic acceptance edit only."
  const fixedResult = await save(app, fixedLabel, fixedPage, fixedEdit, fixedBefore.versions)
  assert.equal(fixedResult.synchronization.sections[0].status, "fixed-layout-unmapped")
  const fixedAfter = await page(app, fixedLabel, fixedPage)
  assert.deepEqual(fixedAfter.rendering, fixedBefore.rendering)
  assert.deepEqual(storageRead(fixedLabel, (storage) => storage.getLatestNodeData("fixed-layout-sectioning", fixedPage)), fixedTree)
  const fixedPreview = await preview(app, fixedLabel, fixedId), fixedPackage = await packaged(fixedLabel, fixedId)
  assert.equal(fixedPackage, beforeFixedPackage)
  assert.ok(!fixedPreview.includes("Semantic acceptance edit only"))
  assert.deepEqual(assets(fixedLabel), beforeFixedAssets)
  fs.writeFileSync(path.join(out, "fixed-preview.html"), fixedPreview)
  fs.writeFileSync(path.join(out, "fixed-packaged.html"), fixedPackage)
  report.checks.push({ name: "Genuine positioned page: semantic Save retains positioned tree, rendering, assets and packaged bytes", passed: true, pageId: fixedPage, sectionId: fixedId, versions: fixedAfter.versions })
  report.browser.push({ label: fixedLabel, pageId: fixedPage, sectionId: fixedId, kind: "genuine fixed-layout limitation" })

  for (const [archiveLabel, id] of [[label, legacyPage], [fixedLabel, fixedPage]]) {
    const before = rows(archiveLabel), beforeAssets = assets(archiveLabel), expected = (await page(app, archiveLabel, id)).sectioningSynchronization
    const response = await app.request(`/books/${archiveLabel}/export-project`)
    assert.equal(response.status, 200)
    const archive = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(path.join(out, `${archiveLabel}.zip`), archive)
    assert.deepEqual(rows(archiveLabel), before)
    const importedApp = appFor(importedDir)
    const form = new FormData()
    form.append("zip", new File([archive], `${archiveLabel}.zip`, { type: "application/zip" }))
    const imported = await importedApp.request("/books/import", { method: "POST", body: form })
    assert.equal(imported.status, 201, await imported.clone().text())
    assert.equal((await imported.json()).label, archiveLabel)
    assert.deepEqual((await page(importedApp, archiveLabel, id)).sectioningSynchronization, expected)
    assert.deepEqual(rows(archiveLabel, importedDir), before)
    assert.deepEqual(assets(archiveLabel, importedDir), beforeAssets)
    report.checks.push({ name: "Production project archive/export/import preserves authoritative drift, immutable histories and asset hashes", passed: true, label: archiveLabel, bytes: archive.length, sha256: digest(archive) })
  }
  for (const [index, original] of sourcePaths.entries()) assert.deepEqual(hashes(original), originalHashes[index], `Original book changed: ${original}`)
  report.originalFilesUnchanged = true
  report.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.error = { message: error.message, stack: error.stack }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2))
  throw error
} finally { globalThis.fetch = originalFetch }
