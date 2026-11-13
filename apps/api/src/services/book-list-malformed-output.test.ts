import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Hono } from "hono"
import { createBookStorage, openBookDb } from "@adt/storage"
import { storyboardCoverage } from "@adt/pipeline"
import { createBookRoutes } from "../routes/books.js"
import { errorHandler } from "../middleware/error-handler.js"
import { listBooks } from "./book-service.js"

let root: string
let configPath: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "book-list-corrupt-output-"))
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
  for (const label of ["bad", "good"]) {
    const storage = createBookStorage(label, root)
    try {
      storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Saved text", images: [], pageImage: { imageId: "pg001_page", buffer: Buffer.from("retained media"), hash: "fixture", format: "png", width: 1, height: 1 } })
      storage.putNodeData("page-sectioning", "pg001", { reasoning: "saved", sections: [{ sectionId: "pg001_sec001", sectionType: "text_only", pageNumber: 1, isPruned: false, backgroundColor: "white", textColor: "black", nodes: [{ nodeId: "pg001_n001", role: "text", text: "Saved text", isPruned: false }] }] })
      storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionId: "pg001_sec001", sectionIndex: 0, sectionType: "text_only", reasoning: "saved", html: '<section data-section-id="pg001_sec001"><p data-id="pg001_n001">Saved text</p></section>' }] })
      storage.putNodeData("quiz-generation", "book", { quizzes: [], language: "en", pagesPerQuiz: 1, generatedAt: "fixture" })
      expect(storyboardCoverage(storage, ["pg001"]).complete).toBe(true)
    } finally { storage.close() }
    fs.mkdirSync(path.join(root, label, "adt"))
    fs.writeFileSync(path.join(root, label, "adt/index.html"), "retained package")
  }
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

it.each([
  "{malformed quiz output",
  JSON.stringify({ quizzes: [{ afterPageId: "pg001" }] }),
  "[]",
  JSON.stringify({ quizzes: [{ quizId: "BAD ID", afterPageId: "pg001", options: [] }] }),
  JSON.stringify({ quizzes: [null] }),
])("GET /books isolates damaged quiz data %s and recovers on a valid version", async damaged => {
  const healthy = listBooks(root, configPath).find(book => book.label === "good")!
  const dbPath = path.join(root, "bad/bad.db")
  const db = openBookDb(dbPath)
  try { db.run("UPDATE node_data SET data = ? WHERE node = ? AND item_id = ?", [damaged, "quiz-generation", "book"]) }
  finally { db.close() }
  const before = fs.readFileSync(dbPath)
  const app = new Hono().onError(errorHandler).route("/", createBookRoutes(root, undefined, configPath))
  const response = await app.request("/books")
  expect(response.status).toBe(200)
  const listed = await response.json()
  expect(listed.find((book: { label: string }) => book.label === "bad")).toMatchObject({ readUnavailable: true, needsRebuild: false, completedStages: [] })
  expect(listed.find((book: { label: string }) => book.label === "good")).toEqual(healthy)
  expect((await app.request("/books/good")).status).toBe(200)
  expect(fs.readFileSync(dbPath).equals(before)).toBe(true)
  expect(fs.readFileSync(path.join(root, "bad/adt/index.html"), "utf8")).toBe("retained package")
  expect(fs.readFileSync(path.join(root, "bad/images/pg001_page.png"), "utf8")).toBe("retained media")
  const storage = createBookStorage("bad", root)
  try { storage.putNodeData("quiz-generation", "book", { quizzes: [], language: "en", pagesPerQuiz: 1, generatedAt: "new valid version" }) }
  finally { storage.close() }
  expect(listBooks(root, configPath).find(book => book.label === "bad")?.readUnavailable).toBeUndefined()
  const inspect = openBookDb(dbPath)
  try { expect(inspect.get("SELECT data FROM node_data WHERE node = ? AND item_id = ? AND version = 1", ["quiz-generation", "book"])).toEqual({ data: damaged }) }
  finally { inspect.close() }
})

it.each(["", "{broken", JSON.stringify({ version: 1 })])("GET /books isolates an invalid transition journal %s without changing it", async journal => {
  const healthy = listBooks(root, configPath).find(book => book.label === "good")!
  const dir = path.join(root, "bad")
  fs.writeFileSync(path.join(dir, ".sectioning-transition.json"), journal)
  fs.writeFileSync(path.join(dir, "config.yaml"), "page_sectioning:\n  mode: page\n")
  const files = ["bad.db", "config.yaml", ".sectioning-transition.json", "images/pg001_page.png", "adt/index.html"]
  const before = files.map(file => fs.readFileSync(path.join(dir, file)))
  const app = new Hono().onError(errorHandler).route("/", createBookRoutes(root, undefined, configPath))
  const response = await app.request("/books")
  expect(response.status).toBe(200)
  const listed = await response.json()
  expect(listed.find((book: { label: string }) => book.label === "bad")).toMatchObject({ readUnavailable: true, needsRebuild: false, completedStages: [] })
  expect(listed.find((book: { label: string }) => book.label === "good")).toEqual(healthy)
  expect((await app.request("/books/good")).status).toBe(200)
  expect(files.map(file => fs.readFileSync(path.join(dir, file)))).toEqual(before)
})

it.each(["config", "sectioning-state"].flatMap(endpoint =>
  ["", "{broken", JSON.stringify({ version: 1 })].map(journal => ({ endpoint, journal }))
))("GET $endpoint returns a typed conflict for invalid journal $journal without changing evidence", async ({ endpoint, journal }) => {
  const dir = path.join(root, "bad")
  fs.writeFileSync(path.join(dir, ".sectioning-transition.json"), journal)
  fs.writeFileSync(path.join(dir, "config.yaml"), "page_sectioning:\n  mode: page\n")
  const files = ["bad.db", "config.yaml", ".sectioning-transition.json", "images/pg001_page.png", "adt/index.html"]
  const before = files.map(file => fs.readFileSync(path.join(dir, file)))
  const app = new Hono().onError(errorHandler).route("/", createBookRoutes(root, undefined, configPath))
  const response = await app.request(`/books/bad/${endpoint}`)
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "BOOK_BUSY", error: expect.stringContaining("journal is retained") })
  for (const [index, file] of files.entries()) expect(fs.readFileSync(path.join(dir, file)).equals(before[index]), file).toBe(true)
  expect((await app.request(`/books/good/${endpoint}`)).status).toBe(200)
})

it.each([null, { quizzes: [] }])("keeps readable legacy quiz data %j usable without rewriting it", data => {
  const dbPath = path.join(root, "bad/bad.db")
  const db = openBookDb(dbPath)
  try { db.run("UPDATE node_data SET data = ? WHERE node = ? AND item_id = ?", [JSON.stringify(data), "quiz-generation", "book"]) }
  finally { db.close() }
  const before = fs.readFileSync(dbPath)
  expect(listBooks(root, configPath).find(book => book.label === "bad")?.readUnavailable).toBeUndefined()
  expect(fs.readFileSync(dbPath)).toEqual(before)
})

it.each([new Error("unexpected filesystem failure"), new TypeError("unexpected filesystem failure")])("does not hide unrelated $name errors behind an unavailable book", error => {
  vi.spyOn(fs, "statSync").mockImplementation(() => { throw error })
  expect(() => listBooks(root, configPath)).toThrow("unexpected filesystem failure")
})
