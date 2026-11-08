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

it("GET /books isolates malformed quiz JSON, retains the damaged bytes and recovers on a valid version", async () => {
  const healthy = listBooks(root, configPath).find(book => book.label === "good")!
  const dbPath = path.join(root, "bad/bad.db"), damaged = "{malformed quiz output"
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

it("does not hide unrelated programming errors behind an unavailable book", () => {
  vi.spyOn(fs, "statSync").mockImplementation(() => { throw new Error("unexpected filesystem failure") })
  expect(() => listBooks(root, configPath)).toThrow("unexpected filesystem failure")
})
