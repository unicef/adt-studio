import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookStorage, openBookDb } from "@adt/storage"
import { PIPELINE } from "@adt/types"
import { createBookRoutes } from "./books.js"
import { createPageRoutes } from "./pages.js"
import { createPackageRoutes } from "./package.js"
import { createStageRoutes } from "./stages.js"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createPageErrorDecisions } from "../services/page-error-decisions.js"
import { createStageService } from "../services/stage-service.js"
import { errorHandler } from "../middleware/error-handler.js"

let root: string, app: Hono
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-source-http-"))
  const config = path.join(root, "global.yaml")
  fs.writeFileSync(config, "structure_types: {}\nrole_types: {}\n")
  const storage = createBookStorage("book", root)
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Original", pageImage: { imageId: "pg001_page", buffer: Buffer.from("retained image"), hash: "image", width: 100, height: 100, format: "png" }, images: [] })
  storage.putNodeData("page-sectioning", "pg001", { reasoning: "", sections: [{ sectionId: "pg001_sec001", sectionType: "text", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [{ nodeId: "pg001_text", role: "heading", text: "Original", isPruned: false }] }] })
  storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "text", reasoning: "", html: '<section data-section-id="pg001_sec001"><h1 data-id="pg001_text">Original</h1></section>' }] })
  for (const stage of PIPELINE) for (const step of stage.steps) storage.markStepCompleted(step.name)
  storage.close()
  const bus = createBookEventBus(), decisions = createPageErrorDecisions(bus)
  const service = createStageService({ run: async () => { throw new Error("No provider calls permitted") } }, bus, decisions)
  app = new Hono().onError(errorHandler)
    .route("/", createBookRoutes(root, undefined, config))
    .route("/", createPageRoutes(root, "prompts", undefined, config))
    .route("/", createPackageRoutes(root, path.resolve("assets/adt"), config))
    .route("/", createStageRoutes(service, bus, decisions, root, "prompts", path.resolve("assets/adt"), config))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
const json = async (url: string) => { const response = await app.request(url); expect(response.status, await response.clone().text()).toBe(200); return response.json() }

it.each(["quiz-generation", "web-rendering", "toc-generation"])("isolates unreadable %s from independent metadata and status", async node => {
  const item = node === "web-rendering" ? "pg001" : "book"
  const storage = createBookStorage("book", root)
  storage.putNodeData("metadata", "book", { title: "Preserved title", authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "" })
  storage.putNodeData("quiz-generation", "book", { generatedAt: "test", language: "en", pagesPerQuiz: 3, quizzes: [] })
  storage.close()
  expect((await app.request("/books/book/package-adt", { method: "POST" })).status).toBe(200)
  const book = path.join(root, "book"), dbPath = path.join(book, "book.db")
  const before = fs.readFileSync(path.join(book, "adt/pg001_sec001.html"))
  const db = openBookDb(dbPath)
  const row = db.get("SELECT version, data FROM node_data WHERE node=? AND item_id=? ORDER BY version DESC LIMIT 1", [node, item]) as { version: number; data: string } | undefined
  if (row) db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=?", ["{", node, item, row.version])
  else db.run("INSERT INTO node_data(node,item_id,version,data) VALUES (?,?,1,?)", [node, item, "{"])
  db.close()
  expect(await json("/books/book")).toMatchObject({ title: "Preserved title", pageCount: 1, needsRebuild: false })
  const statusResponse = await app.request("/books/book/step-status")
  const status = await statusResponse.json()
  if (node === "toc-generation") {
    // Replacement protection is unavailable; never substitute an empty list.
    expect(statusResponse.status).toBe(409)
    expect(status).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED" })
  } else {
    expect(statusResponse.status).toBe(200)
    expect(status.steps["image-filtering"]).toBe("done")
  }
  const packageStatus = await json("/books/book/package-adt/status")
  if (node !== "toc-generation") {
    expect(packageStatus.complete).toBe(false)
    expect(status.stages.preview).not.toBe("done")
    const refused = await app.request("/books/book/export-adt")
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: node === "quiz-generation" ? "HISTORY_REPAIR_REQUIRED" : "PACKAGE_FILES_INCOMPLETE" })
    const retained = await app.request("/books/book/adt/assets/offline-preloader.js")
    expect(retained.status).toBe(node === "quiz-generation" ? 409 : 307)
    if (node === "quiz-generation") expect(await retained.json()).toMatchObject({ code: "HISTORY_REPAIR_REQUIRED" })
  } else {
    // A malformed newer TOC does not erase ownership of an intact retained reader.
    expect(packageStatus.complete).toBe(true)
    const download = await app.request("/books/book/export-adt")
    expect(download.status).toBe(200)
    await download.arrayBuffer()
  }
  expect((await app.request("/books/book/history-recovery")).status).toBe(200)
  expect(fs.readFileSync(path.join(book, "adt/pg001_sec001.html"))).toEqual(before)
  const repaired = openBookDb(dbPath)
  expect(repaired.get("SELECT data FROM node_data WHERE node=? AND item_id=? ORDER BY version DESC LIMIT 1", [node, item])).toMatchObject({ data: "{" })
  // External restoration of exactly the saved row must invalidate unavailable proofs.
  if (row) repaired.run("UPDATE node_data SET data=? WHERE node=? AND item_id=? AND version=?", [row.data, node, item, row.version])
  else repaired.run("DELETE FROM node_data WHERE node=? AND item_id=?", [node, item])
  repaired.close()
  expect((await json("/books/book/package-adt/status")).complete).toBe(true)
  expect((await json("/books/book/step-status")).stages.preview).toBe("done")
})

it("exposes a source-change warning across Library, stage status and a usable export without making coverage missing", async () => {
  const page = await json("/books/book/pages/pg001")
  const tree = structuredClone(page.sectioningTree)
  tree.sections[0].nodes[0].text = "Updated heading"
  const response = await app.request("/books/book/pages/pg001/sectioning", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...tree, baseVersion: page.versions.sectioning }) })
  expect(response.status, await response.clone().text()).toBe(200)
  const status = await json("/books/book/step-status")
  expect(status.coverage.complete).toBe(true)
  expect(status.sourceUpdateStages).toContain("storyboard")
  expect((await json("/books/book"))).toMatchObject({ storyboardNeedsReview: true })
  const library = await json("/books")
  expect((library.books ?? library).find((book: { label: string }) => book.label === "book")).toMatchObject({ storyboardNeedsReview: true })
  expect((await json("/books/book/pages/pg001")).rendering).toEqual(page.rendering)
  const packaged = await app.request("/books/book/package-adt", { method: "POST" })
  expect(packaged.status, await packaged.clone().text()).toBe(200)
  expect(await packaged.json()).toMatchObject({ warnings: [{ kind: "storyboard-source-changed", pageId: "pg001" }] })
  expect((await json("/books/book/package-adt/status")).complete).toBe(true)
})

it("a semantic no-op save preserves completed attempts and creates no source warning", async () => {
  const before = await json("/books/book/step-status")
  const page = await json("/books/book/pages/pg001")
  const response = await app.request("/books/book/pages/pg001/sectioning", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...page.sectioningTree, baseVersion: page.versions.sectioning }) })
  expect(response.status).toBe(200)
  const after = await json("/books/book/step-status")
  expect(after.steps).toEqual(before.steps)
  expect(after.sourceUpdateStages).not.toContain("storyboard")
})
