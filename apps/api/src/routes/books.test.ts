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

describe("GET /books/:label/config", () => {
  it("returns empty config when no overrides exist", async () => {
    createTestBook("config-test")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/config-test/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ config: {} })
  })

  it("returns config overrides when they exist", async () => {
    createTestBook("config-has")
    fs.writeFileSync(
      path.join(tmpDir, "config-has", "config.yaml"),
      "concurrency: 4\n"
    )
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/config-has/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toEqual({ concurrency: 4 })
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/config")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/config")
    expect(res.status).toBe(400)
  })
})

describe("PUT /books/:label/config", () => {
  it("writes config overrides and returns them", async () => {
    createTestBook("put-config")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/put-config/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { concurrency: 8 } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toEqual({ concurrency: 8 })

    expect(
      fs.existsSync(path.join(tmpDir, "put-config", "config.yaml"))
    ).toBe(true)
  })

  it("removes config file when empty overrides", async () => {
    createTestBook("clear-config")
    fs.writeFileSync(
      path.join(tmpDir, "clear-config", "config.yaml"),
      "concurrency: 4\n"
    )
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/clear-config/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: {} }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toEqual({})
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { concurrency: 2 } }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: {} }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when config is missing from body", async () => {
    createTestBook("no-body")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/no-body/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

function addPagesAndRenderings(label: string, count: number): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      storage.putExtractedPage({
        pageId,
        pageNumber: i,
        text: `Page ${i}`,
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: `hash${i}`,
          width: 800,
          height: 600,
        },
        images: [],
      })
      storage.putNodeData("web-rendering", pageId, {
        sections: [{ html: `<p>Rendered page ${i}</p>` }],
      })
    }
  } finally {
    storage.close()
  }
}

function addExtractPages(label: string, count: number): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      storage.putExtractedPage({
        pageId,
        pageNumber: i,
        text: `Page ${i}`,
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: `hash${i}`,
          width: 800,
          height: 600,
        },
        images: [],
      })
    }
  } finally {
    storage.close()
  }
}

function addExtractNodes(label: string, count: number, includeSummary = true): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      storage.putNodeData("text-classification", pageId, { groups: [] })
      storage.putNodeData("image-classification", pageId, { images: [] })
    }
    if (includeSummary) {
      storage.putNodeData("book-summary", "book", { summary: "Test summary" })
    }
  } finally {
    storage.close()
  }
}

function acceptBook(label: string): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putNodeData("storyboard-acceptance", "book", {
      acceptedAt: new Date().toISOString(),
      renderedPageCount: 1,
    })
  } finally {
    storage.close()
  }
}

describe("POST /books/:label/accept-storyboard", () => {
  it("accepts storyboard when all pages rendered", async () => {
    createTestBook("accept-me")
    addPagesAndRenderings("accept-me", 2)
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/accept-me/accept-storyboard", {
      method: "POST",
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBeGreaterThanOrEqual(1)
    expect(body.acceptedAt).toBeDefined()
  })

  it("returns 400 when pages not fully rendered", async () => {
    createTestBook("partial-render")
    // Has no pages with renderings by default
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/partial-render/accept-storyboard", {
      method: "POST",
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/accept-storyboard", {
      method: "POST",
    })
    expect(res.status).toBe(404)
  })

  it("reflects storyboardAccepted in GET /books", async () => {
    createTestBook("accepted-list")
    addPagesAndRenderings("accepted-list", 1)
    const app = createBookRoutes(tmpDir)

    // Accept
    await app.request("/books/accepted-list/accept-storyboard", {
      method: "POST",
    })

    // Verify in list
    const listRes = await app.request("/books")
    const books = await listRes.json()
    const book = books.find((b: { label: string }) => b.label === "accepted-list")
    expect(book.storyboardAccepted).toBe(true)
  })

  it("reflects storyboardAccepted in GET /books/:label", async () => {
    createTestBook("accepted-detail")
    addPagesAndRenderings("accepted-detail", 1)
    const app = createBookRoutes(tmpDir)

    await app.request("/books/accepted-detail/accept-storyboard", {
      method: "POST",
    })

    const detailRes = await app.request("/books/accepted-detail")
    const book = await detailRes.json()
    expect(book.storyboardAccepted).toBe(true)
  })
})

describe("GET /books/:label/step-status", () => {
  it("does not mark extract complete when only pages exist", async () => {
    createTestBook("extract-incomplete")
    addExtractPages("extract-incomplete", 2)
    const app = createBookRoutes(tmpDir)

    const res = await app.request("/books/extract-incomplete/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.steps.extract).not.toBe(true)
  })

  it("marks extract complete only when summary and per-page classifications exist", async () => {
    createTestBook("extract-complete")
    addExtractPages("extract-complete", 2)
    addExtractNodes("extract-complete", 2, false)
    const app = createBookRoutes(tmpDir)

    const beforeSummaryRes = await app.request("/books/extract-complete/step-status")
    expect(beforeSummaryRes.status).toBe(200)
    const beforeSummaryBody = await beforeSummaryRes.json()
    expect(beforeSummaryBody.steps.extract).not.toBe(true)

    addExtractNodes("extract-complete", 2, true)
    const afterSummaryRes = await app.request("/books/extract-complete/step-status")
    expect(afterSummaryRes.status).toBe(200)
    const afterSummaryBody = await afterSummaryRes.json()
    expect(afterSummaryBody.steps.extract).toBe(true)
  })
})

describe("GET /books/:label/export", () => {
  it("returns ZIP when storyboard accepted", async () => {
    createTestBook("export-book")
    addPagesAndRenderings("export-book", 2)
    acceptBook("export-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/export-book/export")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Disposition")).toContain("export-book.zip")
    const buf = await res.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it("returns 400 when storyboard not accepted", async () => {
    createTestBook("not-accepted-export")
    addPagesAndRenderings("not-accepted-export", 1)
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/not-accepted-export/export")
    expect(res.status).toBe(400)
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/export")
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
