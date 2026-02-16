import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { createGlossaryRoutes } from "./glossary.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-glossary-route-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title: "Test Book",
        authors: ["Author"],
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "test",
      }),
    ]
  )
  db.close()
}

function addGlossaryData(label: string): void {
  const db = openBookDb(
    path.join(tmpDir, label, `${label}.db`)
  )
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "glossary",
      "book",
      1,
      JSON.stringify({
        items: [
          {
            word: "Forest",
            definition: "A large area with trees",
            variations: ["forests"],
            emojis: ["🌲"],
          },
        ],
        pageCount: 5,
        generatedAt: "2025-01-01T00:00:00.000Z",
      }),
    ]
  )
  db.close()
}

function addRawGlossaryData(label: string, rawData: string): void {
  const db = openBookDb(
    path.join(tmpDir, label, `${label}.db`)
  )
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    ["glossary", "book", 1, rawData]
  )
  db.close()
}

describe("GET /books/:label/glossary", () => {
  it("returns null when no glossary exists", async () => {
    createTestBook("no-glossary")
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/no-glossary/glossary")
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it("returns glossary when it exists", async () => {
    createTestBook("has-glossary")
    addGlossaryData("has-glossary")
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/has-glossary/glossary")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].word).toBe("Forest")
    expect(body.pageCount).toBe(5)
  })

  it("returns 404 for missing book", async () => {
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/ghost/glossary")
    expect(res.status).toBe(404)
  })

  it("returns controlled 500 when glossary JSON is corrupted", async () => {
    createTestBook("bad-glossary-json")
    addRawGlossaryData("bad-glossary-json", "{bad json")
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/bad-glossary-json/glossary")
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain("Stored glossary data is corrupted")
  })

  it("returns controlled 500 when glossary shape is invalid", async () => {
    createTestBook("bad-glossary-shape")
    addRawGlossaryData(
      "bad-glossary-shape",
      JSON.stringify({ items: [{ word: "Forest" }] })
    )
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/bad-glossary-shape/glossary")
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toContain("Stored glossary data is invalid")
  })

  it("returns 400 for invalid label", async () => {
    const app = createGlossaryRoutes(tmpDir)
    const res = await app.request("/books/-bad/glossary")
    expect(res.status).toBe(400)
  })
})
