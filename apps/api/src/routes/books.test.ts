import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { createBookRoutes } from "./books.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-books-route-"))
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
  fs.writeFileSync(path.join(bookDir, `${label}.pdf`), "fake pdf")
}

describe("GET /books", () => {
  it("returns empty array when no books", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it("returns list of books", async () => {
    createTestBook("my-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books")
    expect(res.status).toBe(200)
    const books = await res.json()
    expect(books).toHaveLength(1)
    expect(books[0].label).toBe("my-book")
    expect(books[0].title).toBe("Test Book")
  })
})

describe("GET /books/:label", () => {
  it("returns book detail", async () => {
    createTestBook("detail")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/detail")
    expect(res.status).toBe(200)
    const book = await res.json()
    expect(book.label).toBe("detail")
    expect(book.metadata).toBeTruthy()
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/missing")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad")
    expect(res.status).toBe(400)
  })
})

describe("POST /books", () => {
  it("creates a book with PDF upload", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "new-book")
    formData.append(
      "pdf",
      new Blob(["%PDF-1.0 fake"], { type: "application/pdf" }),
      "test.pdf"
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(201)
    const book = await res.json()
    expect(book.label).toBe("new-book")
    expect(book.hasSourcePdf).toBe(true)

    expect(
      fs.existsSync(path.join(tmpDir, "new-book", "new-book.pdf"))
    ).toBe(true)
  })

  it("creates a book with config overrides", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "configured")
    formData.append(
      "pdf",
      new Blob(["%PDF-1.0"], { type: "application/pdf" }),
      "test.pdf"
    )
    formData.append(
      "config",
      JSON.stringify({ concurrency: 4 })
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(201)
    expect(
      fs.existsSync(path.join(tmpDir, "configured", "config.yaml"))
    ).toBe(true)
  })

  it("returns 400 when label is missing", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append(
      "pdf",
      new Blob(["fake"], { type: "application/pdf" }),
      "test.pdf"
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when pdf is missing", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "no-pdf")

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it("returns 409 for duplicate label", async () => {
    createTestBook("duplicate")
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "duplicate")
    formData.append(
      "pdf",
      new Blob(["fake"], { type: "application/pdf" }),
      "test.pdf"
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(409)
  })
})

describe("DELETE /books/:label", () => {
  it("deletes a book", async () => {
    createTestBook("to-delete")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/to-delete", { method: "DELETE" })
    expect(res.status).toBe(200)
    expect(fs.existsSync(path.join(tmpDir, "to-delete"))).toBe(false)
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost", { method: "DELETE" })
    expect(res.status).toBe(404)
  })
})
