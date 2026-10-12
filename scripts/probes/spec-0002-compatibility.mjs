/**
 * AC-11 read compatibility against an independently built pre-change tree.
 * Build both trees first (pnpm exec tsc --build apps/api and
 * pnpm --filter @adt/runtime build), then run:
 * node scripts/probes/spec-0002-compatibility.mjs --baseline /path/to/old/tree
 * Uses a disposable real book, current HTTP saves and a separate old-API process.
 * This does not assert preservation when an old application edits/regenerates.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const script = fileURLToPath(import.meta.url)
const currentTree = path.resolve(path.dirname(script), "../..")
const label = "compatibility"
const units = [["page-sectioning", "pg001"], ["toc-generation", "book"], ["quiz-generation", "book"], ["text-catalog-translation", "fr"]]
const load = (tree, file) => import(pathToFileURL(path.join(tree, file)).href)

async function routes(tree, booksDir, guarded = false) {
  const require = createRequire(path.join(tree, "apps/api/package.json"))
  const { Hono } = require("hono")
  const { createPageRoutes } = await load(tree, "apps/api/dist/routes/pages.js")
  const { createTocRoutes } = await load(tree, "apps/api/dist/routes/toc.js")
  const { createQuizRoutes } = await load(tree, "apps/api/dist/routes/quizzes.js")
  const { createTextCatalogRoutes } = await load(tree, "apps/api/dist/routes/text-catalog.js")
  const { createAdtPreviewRoutes } = await load(tree, "apps/api/dist/routes/adt-preview.js")
  const prompts = path.join(tree, "prompts")
  const assets = path.join(tree, "assets/adt")
  const config = path.join(booksDir, "config.yaml")
  const app = new Hono()
  if (guarded) {
    const { bookWriterMiddleware } = await load(tree, "apps/api/dist/middleware/book-writer.js")
    app.use("/books/:label/*", bookWriterMiddleware(booksDir))
  }
  app.route("/", createPageRoutes(booksDir, prompts, assets, config))
    .route("/", createTocRoutes(booksDir))
    .route("/", createQuizRoutes(booksDir, prompts, config))
    .route("/", createTextCatalogRoutes(booksDir, prompts, config))
    .route("/", createAdtPreviewRoutes(booksDir, assets, config, prompts))
  return app
}

async function request(app, route, body) {
  const response = await app.request(`/books/${label}/${route}`, body === undefined ? {} : {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
  const text = await response.text()
  assert.equal(response.status, 200, `${route}: ${text}`)
  return text
}

async function readAndExport(tree, booksDir) {
  const app = await routes(tree, booksDir)
  assert.match(await request(app, "toc"), /Manual contents/)
  assert.match(await request(app, "quizzes"), /Manual question/)
  assert.match(await request(app, "pages/pg001"), /Manual section/)
  assert.match(await request(app, "text-catalog"), /Manual French/)
  assert.match(await request(app, "adt-preview/content/toc.json"), /Manual contents/)
  assert.match(await request(app, "adt-preview/content/i18n/fr/texts.json"), /Manual French/)
  assert.match(await request(app, "adt-preview/pg001_sec001.html"), /Manual section/)
  const quiz = JSON.parse(await request(app, "quizzes")).quizzes.quizzes[0]
  assert.match(await request(app, `adt-preview/${quiz.quizId}.html`), /Manual question/)
  const { createBookStorage } = await load(tree, "packages/storage/dist/index.js")
  const { packageAdtWeb, loadBookConfig } = await load(tree, "packages/pipeline/dist/index.js")
  const storage = createBookStorage(label, booksDir)
  const bookDir = path.join(booksDir, label)
  try {
    await packageAdtWeb(storage, {
      bookDir, label, language: "en", outputLanguages: ["en", "fr"], title: "Compatibility",
      webAssetsDir: path.join(tree, "assets/adt"), promptsDir: path.join(tree, "prompts"),
      configDir: path.join(tree, "config"), config: loadBookConfig(label, booksDir, path.join(booksDir, "config.yaml")),
    })
    for (const [file, expected] of [
      ["content/toc.json", /Manual contents/], ["content/i18n/fr/texts.json", /Manual French/],
      ["pg001_sec001.html", /Manual section/], [`${quiz.quizId}.html`, /Manual question/],
    ]) assert.match(fs.readFileSync(path.join(bookDir, "adt", file), "utf8"), expected)
  } finally { storage.close() }
}

if (process.argv[2] === "--read-only") {
  await readAndExport(path.resolve(process.argv[3]), process.argv[4])
  console.log("Pre-change API: four entity reads, preview and web export passed")
} else {
  assert.equal(process.argv[2], "--baseline", "Usage: --baseline /path/to/built/pre-change/tree")
  assert.ok(process.argv[3], "A pre-change tree is required")
  const baseline = path.resolve(process.argv[3])
  assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(currentTree), "Baseline must be independent")
  const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-spec0002-compat-"))
  try {
    fs.writeFileSync(path.join(booksDir, "config.yaml"), "default_model: ollama:tinyllama\nrole_types:\n  section_text: Text\nstructure_types: {}\noutput_languages: [en, fr]\ncore_tts:\n  latex_to_speech: false\n  language_normalization: false\n")
    const { createBookStorage } = await load(currentTree, "packages/storage/dist/index.js")
    const storage = createBookStorage(label, booksDir)
    const sectioning = { source: "ai", reasoning: "", sections: [{
      sectionId: "pg001_sec001", sectionType: "text_only", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
      nodes: [{ nodeId: "pg001_t001", role: "section_text", text: "Manual section", isPruned: false }],
    }] }
    const rendering = { sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "", html: '<section data-section-id="pg001_sec001"><p data-id="pg001_t001">Manual section</p></section>' }] }
    try {
      storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Source", images: [], pageImage: { imageId: "pg001_page", buffer: Buffer.from("image"), format: "png", hash: "fixture", width: 1, height: 1 } })
      storage.putNodeData("metadata", "book", { language_code: "en", title: "Compatibility" })
      storage.putNodeData("page-sectioning", "pg001", sectioning)
      storage.putNodeData("web-rendering", "pg001", rendering)
    } finally { storage.close() }
    const app = await routes(currentTree, booksDir, true)
    await request(app, "pages/pg001/sectioning", { ...sectioning, sections: sectioning.sections.map((section) => ({ ...section, textColor: "#111111" })), baseVersion: 1 })
    await request(app, "toc", { baseVersion: 0, entries: [{ id: "toc1", title: "Manual contents", sectionId: "pg001_sec001", href: "pg001_sec001.html", chapterId: "ch1", level: 1 }], pageCount: 1, generatedAt: "fixture" })
    await request(app, "quizzes", { baseVersion: 0, generatedAt: "fixture", language: "en", pagesPerQuiz: 1, quizzes: [{ quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: "Manual question", answerIndex: 0, reasoning: "", options: ["One", "Two", "Three"].map((text) => ({ text, explanation: "" })) }] })
    const catalog = JSON.parse(await request(app, "text-catalog"))
    await request(app, "text-catalog-translation/fr", { entries: catalog.entries.map(({ id }) => ({ id, text: `Manual French ${id}` })), baseVersion: 0, sourceVersion: catalog.version, sourceSignature: catalog.translations.fr.sourceSignature })
    const snapshot = () => {
      const db = createBookStorage(label, booksDir)
      try { return units.map(([node, id]) => ({ current: db.getLatestNodeData(node, id), history: db.getAllNodeVersions(node, id) })) }
      finally { db.close() }
    }
    const before = snapshot()
    for (const { current } of before) assert.match(JSON.stringify(current.data), /"source":"manual"/)
    const old = spawnSync(process.execPath, [script, "--read-only", baseline, booksDir], { stdio: "inherit", cwd: baseline })
    if (old.error) throw old.error
    assert.equal(old.status, 0, "Pre-change API read/export failed")
    assert.deepEqual(snapshot(), before, "Old reads/export changed current authorship or version history")
    await readAndExport(currentTree, booksDir)
    assert.deepEqual(snapshot(), before, "Reopening with current API changed saved work")
    console.log("Current save → old read/preview/export → current reopen: passed; authorship, IDs and all history unchanged")
  } finally { fs.rmSync(booksDir, { recursive: true, force: true }) }
}
