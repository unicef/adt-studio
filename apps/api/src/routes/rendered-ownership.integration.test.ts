import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { buildTextCatalogSnapshot, buildImageInventory, buildEasyReadSourceBlocks, resolveReadingOrder, packageAdtWeb, loadBookConfig, renderingOwnershipWarnings } from "@adt/pipeline"
import type { PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import { createPageRoutes } from "./pages.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { createBookTools } from "@adt/agents"
import { createOutputRoutes } from "./outputs.js"
import { JSDOM } from "jsdom"

let root: string
const label = "ownership"
const storage = () => createBookStorage(label, root)
const sections: PageSectioningOutput = { reasoning: "", sections: ["A", "B"].map((id) => ({ sectionId: id, sectionType: "activity_fill_in_the_blank", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: `text-${id}`, role: "body_text", text: `Question ${id}`, isPruned: false }] })) }
const rendering: WebRenderingOutput = { sections: ["A", "B"].map((id, i) => ({ sectionIndex: i, sectionType: "activity_fill_in_the_blank", reasoning: "", html: `<section data-section-id="${id}"><p data-id="text-${id}">Question ${id}</p><img data-id="image-${id}"/><input data-activity-item="item-1"/></section>`, activityAnswers: { "item-1": i === 0 ? "sun" : "moon" } })) }
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-rendered-ownership-"))
  const db = storage()
  db.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "", pageImage: { imageId: "pg001_page", buffer: Buffer.from("page"), format: "png", hash: "page", width: 100, height: 100 }, images: [] })
  db.putNodeData("metadata", "book", { language_code: "en" })
  db.putNodeData("page-sectioning", "pg001", sections)
  db.putNodeData("web-rendering", "pg001", rendering)
  db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "A_ans_item-1", text: "Manuel Soleil", source: "manual" }, { id: "B_ans_item-1", text: "Manuel Lune", source: "manual" }], generatedAt: "before" })
  fs.writeFileSync(path.join(db.bookDir!, "config.yaml"), "editing_language: en\noutput_languages: [en, fr]\n")
  db.close()
})
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(root, { recursive: true, force: true }) })
const answerMap = () => { const db = storage(); try { return Object.fromEntries(buildTextCatalogSnapshot(db, db.getPages()).entries.filter((entry) => entry.id.includes("_ans_")).map((entry) => [entry.id, entry.text])) } finally { db.close() } }

it("AC-4/9 keeps answers, contexts, images and packaged corrections with their owner across source reorder, prune and restore", async () => {
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"))
  const before = storage(); const corrections = before.getLatestNodeData("text-catalog-translation", "fr"); const raw = before.getLatestNodeData("web-rendering", "pg001"); before.close()
  const provider = vi.fn(() => { throw new Error("Save must not generate") }); vi.stubGlobal("fetch", provider)
  const reordered = { ...sections, sections: [...sections.sections].reverse() }
  const response = await app.request(`/books/${label}/pages/pg001/sectioning`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reordered) })
  expect(response.status).toBe(200)
  expect(answerMap()).toEqual({ "A_ans_item-1": "sun", "B_ans_item-1": "moon" })
  const db = storage()
  try {
    expect(db.getLatestNodeData("web-rendering", "pg001")).toEqual(raw)
    expect(db.getLatestNodeData("text-catalog-translation", "fr")).toEqual(corrections)
    expect(buildImageInventory(db).map(({ id, sectionIds }) => ({ id, sectionIds }))).toEqual([{ id: "image-A", sectionIds: ["A"] }, { id: "image-B", sectionIds: ["B"] }])
    expect(buildEasyReadSourceBlocks(db, db.getPages()).map((block) => [block.sectionId, block.entries[0].sourceId])).toEqual([["A", "text-A"], ["B", "text-B"]])
    expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["A", "B"])
    await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en", "fr"], title: "Owners", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/A.html"), "utf8")).toContain('"item-1":"sun"')
    expect(fs.readFileSync(path.join(db.bookDir!, "adt/B.html"), "utf8")).toContain('"item-1":"moon"')
    db.putNodeData("page-sectioning", "pg001", { ...reordered, sections: reordered.sections.map((section) => ({ ...section, isPruned: section.sectionId === "A" })) })
    expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["B"])
    expect(buildImageInventory(db).map((item) => item.id)).toEqual(["image-B"])
    expect(buildEasyReadSourceBlocks(db, db.getPages()).map((block) => block.sectionId)).toEqual(["B"])
    expect(buildTextCatalogSnapshot(db, db.getPages()).entries.filter((entry) => entry.id.includes("_ans_")).map((entry) => entry.id)).toEqual(["B_ans_item-1"])
    db.setCurrentNodeVersion("page-sectioning", "pg001", 1)
    expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["A", "B"])
    expect(db.getLatestNodeData("text-catalog-translation", "fr")).toEqual(corrections)
  } finally { db.close() }
  expect(provider).not.toHaveBeenCalled()
})

it.each(["removed", "identityless", "conflicting", "nested"] as const)("AC-4/12 retains and discloses %s owners without assigning another section's answers", async (scenario) => {
  const db = storage()
  const next = structuredClone(rendering)
  if (scenario === "identityless") next.sections[0].html = next.sections[0].html.replace(' data-section-id="A"', "")
  if (scenario === "conflicting") next.sections[0].sectionId = "B"
  if (scenario === "nested") next.sections[0].html += '<section data-section-id="B"></section>'
  db.putNodeData("web-rendering", "pg001", next)
  // Stable leaves can move while an old rendering remains: they do not prove ownership.
  db.putNodeData("page-sectioning", "pg001", { ...sections, sections: [{ ...sections.sections[1], nodes: sections.sections[0].nodes }] })
  const raw = db.getAllNodeVersions("web-rendering", "pg001")
  const corrections = db.getLatestNodeData("text-catalog-translation", "fr")
  expect(buildTextCatalogSnapshot(db, db.getPages()).entries.find((entry) => entry.id === "B_ans_item-1")?.text).toBe("moon")
  expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual(["B"])
  expect(renderingOwnershipWarnings(db)).toEqual([{ kind: "orphaned-rendering", pageId: "pg001", sectionIndex: 0 }])
  db.close()
  const app = createOutputRoutes(root, path.resolve("prompts"))
  for (const suffix of ["", "/disclosure"]) {
    const response = await app.request(`/books/${label}/outputs${suffix}`)
    expect(response.status).toBe(200)
    expect((await response.json()).ownershipWarnings).toHaveLength(1)
  }
  const reopened = storage()
  expect(reopened.getAllNodeVersions("web-rendering", "pg001")).toEqual(raw)
  expect(reopened.getLatestNodeData("text-catalog-translation", "fr")).toEqual(corrections)
  reopened.close()
})


it.each(["fixed-layout-sectioning", "page-sectioning"])("keeps legacy fixed-layout content stored in %s available without regenerating or rewriting it", async (node) => {
  const db = storage()
  const id = "pg001_sec001"
  db.putNodeData(node, "pg001", { ...sections, sections: [{ ...sections.sections[0], sectionId: id, sectionType: "fixed-layout-page", viewport: { width: 100, height: 100 }, placement: {} }] })
  db.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "fixed-layout-page", reasoning: "develop", html: '<div id="content" style="position:relative;width:100px;height:100px"><p data-id="pg001_tx001">Retained manual page</p></div>' }] })
  const history = db.getAllNodeVersions("web-rendering", "pg001")
  expect(resolveReadingOrder(db).items.map((item) => item.id)).toEqual([id])
  expect(buildEasyReadSourceBlocks(db, db.getPages())[0].entries[0].originalText).toBe("Retained manual page")
  expect(buildTextCatalogSnapshot(db, db.getPages()).entries[0].locations?.[0].sectionId).toBe(id)
  expect(renderingOwnershipWarnings(db)).toEqual([])
  await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en"], title: "Fixed", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  const exported = fs.readFileSync(path.join(db.bookDir!, `adt/${id}.html`), "utf8")
  expect(exported).toContain("Retained manual page")
  expect(exported).toContain(`data-section-id="${id}"`)
  expect(db.getAllNodeVersions("web-rendering", "pg001")).toEqual(history)
  db.close()
  const preview = createAdtPreviewRoutes(root, path.resolve("assets/adt"))
  const response = await preview.request(`/books/${label}/adt-preview/${id}.html`)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("Retained manual page")
})

it("Preview uses the rendering's owner after sectioning restore rather than its old index", async () => {
  const db = storage()
  db.putNodeData("page-sectioning", "pg001", { ...sections, sections: [{ ...sections.sections[1], sectionId: "pg001_sec002" }] })
  db.putNodeData("web-rendering", "pg001", { sections: rendering.sections.map((entry, i) => ({ ...entry, sectionId: `pg001_sec00${i + 1}`, html: `<section data-section-id="pg001_sec00${i + 1}"><p>Question ${i === 0 ? "A" : "B"}</p></section>` })) })
  db.close()
  const response = await createAdtPreviewRoutes(root, path.resolve("assets/adt")).request(`/books/${label}/adt-preview/pg001_sec002.html`)
  expect(response.status).toBe(200)
  const html = await response.text()
  expect(html).toContain("Question B")
  expect(html).not.toContain("Question A")
  expect(html).toContain('"item-1":"moon"')
})

it("new assistant custom activities and their updates have stable owners in Preview and export", async () => {
  const db = storage()
  const { tools } = createBookTools({ storage: db, bookLabel: label, booksDir: root, promptsDir: path.resolve("prompts"), credentials: {}, activityMode: "custom" })
  const created = await tools.createCustomSection!.execute!({ pageId: "pg001", sectionType: "activity_custom_test", reasoning: "test", html: '<section data-id="activity-root"><p data-id="custom-question">Custom question</p><script>window.adtRegisterCustomActivity(document.currentScript.closest("section"),{validate:()=>true});</script></section>', activityAnswers: { answer: "Custom answer" } }, {} as never) as { sectionId: string; sectionIndex: number }
  expect(created).toMatchObject({ ok: true })
  expect(resolveReadingOrder(db).items.map((item) => item.id)).toContain(created.sectionId)
  await tools.updateSection!.execute!({ pageId: "pg001", sectionIndex: created.sectionIndex, reasoning: "edited", html: '<section><p data-id="custom-question">Edited custom question</p></section>', activityAnswers: { answer: "Edited answer" } }, {} as never)
  expect(buildTextCatalogSnapshot(db, db.getPages()).entries.find((entry) => entry.id === `${created.sectionId}_ans_answer`)?.text).toBe("Edited answer")
  await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en"], title: "Custom", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  expect(fs.readFileSync(path.join(db.bookDir!, `adt/${created.sectionId}.html`), "utf8")).toContain("Edited custom question")
  db.close()
  const response = await createAdtPreviewRoutes(root, path.resolve("assets/adt")).request(`/books/${label}/adt-preview/${created.sectionId}.html`)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("Edited custom question")
})


it("retains retired Easy Read history without exposing it in Preview or export", async () => {
  const db = storage()
  fs.appendFileSync(path.join(db.bookDir!, "config.yaml"), "easy_read:\n  enabled: true\n")
  const source = { ...sections.sections[0], sectionId: "pg001_sec001", sectionType: "text", nodes: [] }
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [source] })
  const rendered = { sectionId: source.sectionId, sectionIndex: 0, sectionType: "text", reasoning: "", html: '<section data-section-id="pg001_sec001"><p data-id="retired">Retired phrase</p></section>' }
  db.putNodeData("web-rendering", "pg001", { sections: [rendered] })
  const blocks = buildEasyReadSourceBlocks(db, db.getPages())
  blocks[0].entries[0].text = "Retained manual Easy Read"
  blocks[0].entries[0].source = "manual"
  db.putNodeData("easy-read", "book", { blocks, generatedAt: "before" })
  const retained = db.getAllNodeVersions("easy-read", "book")
  db.putNodeData("web-rendering", "pg001", { sections: [{ ...rendered, html: '<section data-section-id="pg001_sec001"><h1 data-id="current">Current heading</h1></section>' }] })
  expect(buildEasyReadSourceBlocks(db, db.getPages()).flatMap((block) => block.entries)).toEqual([])
  await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en"], title: "Retired", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  const config = JSON.parse(fs.readFileSync(path.join(db.bookDir!, "adt/assets/config.json"), "utf8"))
  const texts = JSON.parse(fs.readFileSync(path.join(db.bookDir!, "adt/content/i18n/en/texts.json"), "utf8"))
  expect(config.features.easyRead).toBe(false)
  expect(texts).not.toHaveProperty("retired_easy_read")
  expect(db.getAllNodeVersions("easy-read", "book")).toEqual(retained)
  db.close()
  const preview = createAdtPreviewRoutes(root, path.resolve("assets/adt"))
  const previewConfig = await (await preview.request(`/books/${label}/adt-preview/assets/config.json`)).json()
  const previewTexts = await (await preview.request(`/books/${label}/adt-preview/content/i18n/en/texts.json`)).json()
  expect(previewConfig.features.easyRead).toBe(false)
  expect(previewTexts).not.toHaveProperty("retired_easy_read")
})


it("legacy custom activity leaf identities preserve answers, scripts, Preview/export and page editing", async () => {
  const db = storage()
  const id = "pg001_s0"
  const script = `window.adtRegisterCustomActivity(document.querySelector('[data-id="${id}"]'),{validate:()=>true});`
  const source = { ...sections.sections[0], sectionId: id, sectionType: "activity_custom_test", nodes: [{ nodeId: "question", role: "body_text", text: "Legacy custom question", isPruned: false }] }
  const old = { sectionIndex: 0, sectionType: source.sectionType, reasoning: "legacy", html: `<section data-id="${id}" data-section-type="activity_custom_test"><p data-id="question">Legacy custom question</p><script>${script}</script></section>`, activityAnswers: { answer: "Manual answer" } }
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [source] })
  const version = db.putNodeData("web-rendering", "pg001", { sections: [old] })
  expect(renderingOwnershipWarnings(db)).toEqual([])
  expect(buildTextCatalogSnapshot(db, db.getPages()).entries.find(entry => entry.id === `${id}_ans_answer`)?.text).toBe("Manual answer")
  await packageAdtWeb(db, { bookDir: db.bookDir!, label, language: "en", outputLanguages: ["en"], title: "Legacy activity", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
  expect(fs.readFileSync(path.join(db.bookDir!, `adt/${id}.html`), "utf8")).toContain(script)
  db.close()
  const preview = await createAdtPreviewRoutes(root, path.resolve("assets/adt")).request(`/books/${label}/adt-preview/${id}.html`)
  expect(preview.status).toBe(200)
  expect(await preview.text()).toContain(script)
  const clone = await createPageRoutes(root, path.resolve("prompts"), path.resolve("assets")).request(`/books/${label}/pages/pg001/sections/0/clone`, { method: "POST" })
  expect(clone.status).toBe(200)
  const updated = storage()
  try {
    expect(resolveReadingOrder(updated).items.filter(item => item.kind === "section")).toHaveLength(2)
    expect(updated.getAllNodeVersions("web-rendering", "pg001").find(row => row.version === version)?.data).toEqual({ sections: [old] })
    expect((updated.getLatestNodeData("web-rendering", "pg001")?.data as WebRenderingOutput).sections[0].html).toContain(script)
    for (const entry of (updated.getLatestNodeData("web-rendering", "pg001")?.data as WebRenderingOutput).sections) {
      let registered: HTMLElement | null = null
      const dom = new JSDOM(entry.html, { runScripts: "dangerously", beforeParse(window) {
        window.adtRegisterCustomActivity = (section: HTMLElement) => { registered = section }
      } })
      expect(registered).not.toBeNull()
      dom.window.close()
    }
  } finally { updated.close() }
})

it.each(["clone", "split", "merge", "delete"])("legacy custom content no longer locks neighboring %s operations", async operation => {
  const db = storage()
  const id = "pg001_s0"
  const old = { sectionIndex: 0, sectionType: "activity_custom_test", reasoning: "", html: `<section data-id="${id}" data-section-type="activity_custom_test"><p data-id="activity-text">Retained custom activity</p><script>window.preserved=true</script></section>`, activityAnswers: { answer: "Retained answer" } }
  db.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [
    { ...sections.sections[0], sectionId: id, sectionType: old.sectionType, nodes: [{ nodeId: "activity-text", role: "body_text", text: "Retained custom activity", isPruned: false }] },
    { ...sections.sections[0], sectionId: "pg001_sec002", nodes: [0, 1].map(i => ({ nodeId: `neighbor-${i}`, role: "body_text", text: `Neighbor ${i}`, isPruned: false })) },
    { ...sections.sections[1], sectionId: "pg001_sec003" },
  ] })
  const version = db.putNodeData("web-rendering", "pg001", { sections: [old,
    { ...rendering.sections[0], sectionIndex: 1, sectionId: "pg001_sec002", html: '<section data-section-id="pg001_sec002"><p data-id="neighbor-0">Neighbor 0</p><p data-id="neighbor-1">Neighbor 1</p></section>' },
    { ...rendering.sections[1], sectionIndex: 2, sectionId: "pg001_sec003", html: '<section data-section-id="pg001_sec003"><p data-id="text-B">Question B</p></section>' },
  ] })
  db.close()
  const response = await createPageRoutes(root, path.resolve("prompts"), path.resolve("assets")).request(`/books/${label}/pages/pg001/sections/1${operation === "delete" ? "" : `/${operation}`}`, {
    method: operation === "delete" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, ...(operation === "split" ? { body: JSON.stringify({ beforeNodeIndex: 1 }) } : {}),
  })
  expect(response.status).toBe(200)
  const updated = storage()
  try {
    expect(resolveReadingOrder(updated).items.map(item => item.id)).toContain(id)
    expect(buildTextCatalogSnapshot(updated, updated.getPages()).entries.find(entry => entry.id === `${id}_ans_answer`)?.text).toBe("Retained answer")
    expect((updated.getLatestNodeData("web-rendering", "pg001")?.data as WebRenderingOutput).sections[0].html).toContain("window.preserved=true")
    expect((updated.getAllNodeVersions("web-rendering", "pg001").find(row => row.version === version)?.data as WebRenderingOutput).sections[0]).toEqual(old)
  } finally { updated.close() }
})

it.each(["editor", "assistant"])("leaf-only activity reads preserve versions; %s edits retain manual answer translations", async mode => {
  const owner = "pg001_sec001"
  const db = storage()
  const old = { ...rendering.sections[0], sectionType: "activity_custom_test", html: '<section data-id="unrelated-root"><p data-id="text-A">Question A</p><script>window.custom=true</script></section>' }
  db.putNodeData("page-sectioning", "pg001", { ...sections, sections: [{ ...sections.sections[0], sectionId: owner, sectionType: old.sectionType }, sections.sections[1]] })
  db.putNodeData("web-rendering", "pg001", { sections: [old, rendering.sections[1]] })
  db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: `${owner}_ans_item-1`, text: "Manuel Soleil", source: "manual" }], generatedAt: "before" })
  const versions = db.getNodeVersionFingerprint()
  const translations = db.getLatestNodeData("text-catalog-translation", "fr")
  const historical = db.getAllNodeVersions("web-rendering", "pg001")
  db.close()
  const provider = vi.fn(() => { throw new Error("Ownership must not generate") }); vi.stubGlobal("fetch", provider)
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"))
  const response = await app.request(`/books/${label}/pages/pg001`)
  expect(response.status).toBe(200)
  const detail = await response.json()
  expect(detail.rendering.sections[0]).toEqual({ ...old, sectionId: owner })
  const read = storage()
  expect(read.getNodeVersionFingerprint()).toEqual(versions)
  expect(buildImageInventory(read).find(item => item.id === "image-B")?.sectionIds).toEqual(["B"])
  expect(buildEasyReadSourceBlocks(read, read.getPages()).some(block => block.sectionId === owner)).toBe(true)
  read.close()
  if (mode === "editor") {
  const save = await app.request(`/books/${label}/pages/pg001/rendering`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detail.rendering) })
  expect(save.status).toBe(200)
  }
  const updated = storage()
  try {
    const { tools } = createBookTools({ storage: updated, bookLabel: label, booksDir: root, promptsDir: path.resolve("prompts"), credentials: {} })
    const edited = await tools.updateSection!.execute!({ pageId: "pg001", sectionIndex: 0, html: old.html.replace("Question A", "Edited A"), reasoning: "edit", activityAnswers: null }, {} as never)
    expect(edited).toMatchObject({ ok: true })
    const entry = (updated.getLatestNodeData("web-rendering", "pg001")?.data as WebRenderingOutput).sections[0]
    expect(entry.sectionId).toBe(owner)
    expect(entry.html).toContain(`data-section-id="${owner}"`)
    expect(entry.html).toContain("window.custom=true")
    expect(entry.activityAnswers).toEqual(old.activityAnswers)
    expect(updated.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translations)
    for (const row of historical) expect(updated.getAllNodeVersions("web-rendering", "pg001")).toContainEqual(row)
    await packageAdtWeb(updated, { bookDir: updated.bookDir!, label, language: "en", outputLanguages: ["en", "fr"], title: "Legacy", webAssetsDir: path.resolve("assets/adt"), config: loadBookConfig(label, root), promptsDir: path.resolve("prompts"), configDir: path.resolve("config") })
    const fr = JSON.parse(fs.readFileSync(path.join(updated.bookDir!, "adt/content/i18n/fr/texts.json"), "utf8"))
    expect(fr[`${owner}_ans_item-1`]).toBe("Manuel Soleil")
  } finally { updated.close() }
  const preview = await createAdtPreviewRoutes(root, path.resolve("assets/adt")).request(`/books/${label}/adt-preview/${owner}.html`)
  expect(preview.status).toBe(200)
  expect(await preview.text()).toContain('"item-1":"sun"')
  expect(provider).not.toHaveBeenCalled()
})

it.each(["clone", "delete"])("resolves leaf ownership before %s after ordinary source reorder", async operation => {
  const db = storage()
  const unowned = { sections: rendering.sections.map(entry => ({ ...entry, html: entry.html.replace(/ data-section-id="[AB]"/, "") })) }
  db.putNodeData("web-rendering", "pg001", unowned)
  // Simulate an older already-reordered book: no pre-edit materialization existed.
  db.putNodeData("page-sectioning", "pg001", { ...sections, sections: [...sections.sections].reverse() })
  const translations = db.getLatestNodeData("text-catalog-translation", "fr")
  const history = db.getAllNodeVersions("web-rendering", "pg001")
  db.close()
  const app = createPageRoutes(root, path.resolve("prompts"), path.resolve("assets"))
  const beforeEdit = await app.request(`/books/${label}/pages/pg001`)
  const detail = await beforeEdit.json()
  expect(detail.rendering.sections.find((entry: WebRenderingOutput["sections"][number]) => entry.sectionIndex === 0).sectionId).toBe("B")
  const response = await app.request(`/books/${label}/pages/pg001/sections/0${operation === "clone" ? "/clone" : ""}`, { method: operation === "clone" ? "POST" : "DELETE" })
  expect(response.status).toBe(200)
  const changed = storage()
  try {
    expect(answerMap()["A_ans_item-1"]).toBe("sun")
    const entries = (changed.getLatestNodeData("web-rendering", "pg001")?.data as WebRenderingOutput).sections
    expect(entries.find(entry => entry.sectionId === "A")?.activityAnswers).toEqual({ "item-1": "sun" })
    expect(changed.getLatestNodeData("text-catalog-translation", "fr")).toEqual(translations)
    for (const row of history) expect(changed.getAllNodeVersions("web-rendering", "pg001")).toContainEqual(row)
    if (operation === "clone") expect(entries.find(entry => entry.sectionId !== "A" && entry.sectionId !== "B")?.activityAnswers).toEqual({ "item-1": "moon" })
    else expect(entries.some(entry => entry.sectionId === "B")).toBe(false)
  } finally { changed.close() }
})
