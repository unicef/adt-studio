import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage } from "@adt/storage"
import { SCHEMA_VERSION } from "@adt/types"
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

function createLegacySchemaBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run("UPDATE schema_version SET version = ? WHERE id = 1", [
    SCHEMA_VERSION - 1,
  ])
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

  it("includes legacy schema books as needs rebuild instead of failing", async () => {
    createLegacySchemaBook("old-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books")
    expect(res.status).toBe(200)
    const books = await res.json()
    expect(books).toHaveLength(1)
    expect(books[0].label).toBe("old-book")
    expect(books[0].needsRebuild).toBe(true)
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

  it("returns legacy schema books as needs rebuild", async () => {
    createLegacySchemaBook("old-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/old-book")
    expect(res.status).toBe(200)
    const book = await res.json()
    expect(book.needsRebuild).toBe(true)
    expect(book.rebuildReason).toContain("older storage schema")
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

describe("GET /books/:label/images/:imageId", () => {
  function createBookWithImage(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one",
        pageImage: {
          imageId: `${label}_p1_page`,
          buffer: Buffer.from("fake-png-data"),
          format: "png" as const,
          hash: "abc123",
          width: 800,
          height: 600,
        },
        images: [],
      })
    } finally {
      storage.close()
    }
  }

  function createBookWithImagePath(
    label: string,
    imageId: string,
    imagePath: string
  ): void {
    const bookDir = path.join(tmpDir, label)
    fs.mkdirSync(bookDir, { recursive: true })
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    db.run(
      "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
      [`${label}_p1`, 1, "Page one"]
    )
    db.run(
      "INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [imageId, `${label}_p1`, imagePath, "hash", 100, 100, "extract"]
    )
    db.close()
  }

  it("returns image as PNG binary", async () => {
    createBookWithImage("img-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book/images/img-book_p1_page")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    const buf = await res.arrayBuffer()
    expect(Buffer.from(buf).toString()).toBe("fake-png-data")
  })

  it("returns 404 for nonexistent image", async () => {
    createBookWithImage("img-book2")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book2/images/no-such-image")
    expect(res.status).toBe(404)
  })

  it("returns 404 for nonexistent book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/no-such-book/images/some-image")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/images/some-image")
    expect(res.status).toBe(400)
  })

  it("returns image/jpeg content type for .jpeg paths", async () => {
    createBookWithImagePath("img-book-jpeg", "img-book-jpeg_p1_page", "images/photo.jpeg")
    const jpegPath = path.join(tmpDir, "img-book-jpeg", "images", "photo.jpeg")
    fs.mkdirSync(path.dirname(jpegPath), { recursive: true })
    fs.writeFileSync(jpegPath, Buffer.from("fake-jpeg-data"))

    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book-jpeg/images/img-book-jpeg_p1_page")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
  })

  it("returns image/jpeg content type for uppercase .JPG paths", async () => {
    createBookWithImagePath("img-book-jpg-up", "img-book-jpg-up_p1_page", "images/photo.JPG")
    const jpgPath = path.join(tmpDir, "img-book-jpg-up", "images", "photo.JPG")
    fs.mkdirSync(path.dirname(jpgPath), { recursive: true })
    fs.writeFileSync(jpgPath, Buffer.from("fake-jpg-data"))

    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book-jpg-up/images/img-book-jpg-up_p1_page")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
  })

  it("returns 400 for escaped image paths from DB", async () => {
    createBookWithImagePath("img-book3", "img-book3_p1_page", "../outside.png")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book3/images/img-book3_p1_page")
    expect(res.status).toBe(400)
  })
})
