import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { listBooks, getBook, createBook, deleteBook } from "./book-service.js"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-book-service-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestDb(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.close()
}

function addTestPages(label: string, count: number): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  for (let i = 1; i <= count; i++) {
    db.run(
      "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
      [`pg${String(i).padStart(3, "0")}`, i, `Page ${i} text`]
    )
  }
  db.close()
}

function addTestMetadata(
  label: string,
  metadata: { title: string | null; authors: string[] }
): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title: metadata.title,
        authors: metadata.authors,
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "test",
      }),
    ]
  )
  db.close()
}

function createTestPdf(label: string): void {
  fs.writeFileSync(
    path.join(tmpDir, label, `${label}.pdf`),
    Buffer.from("%PDF-1.0 fake")
  )
}

describe("listBooks", () => {
  it("returns empty array for empty directory", () => {
    expect(listBooks(tmpDir)).toEqual([])
  })

  it("returns empty array when directory does not exist", () => {
    expect(listBooks(path.join(tmpDir, "nonexistent"))).toEqual([])
  })

  it("returns book with metadata and page count", () => {
    createTestDb("my-book")
    addTestPages("my-book", 3)
    addTestMetadata("my-book", { title: "Test Title", authors: ["Alice"] })
    createTestPdf("my-book")

    const books = listBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]).toEqual({
      label: "my-book",
      title: "Test Title",
      authors: ["Alice"],
      pageCount: 3,
      hasSourcePdf: true,
    })
  })

  it("returns book without metadata when DB has no metadata", () => {
    createTestDb("empty-book")

    const books = listBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]).toEqual({
      label: "empty-book",
      title: null,
      authors: [],
      pageCount: 0,
      hasSourcePdf: false,
    })
  })

  it("returns book without DB as created-only", () => {
    const bookDir = path.join(tmpDir, "no-db")
    fs.mkdirSync(bookDir)
    fs.writeFileSync(path.join(bookDir, "no-db.pdf"), "fake pdf")

    const books = listBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0]).toEqual({
      label: "no-db",
      title: null,
      authors: [],
      pageCount: 0,
      hasSourcePdf: true,
    })
  })

  it("lists multiple books sorted by label", () => {
    createTestDb("book-b")
    createTestDb("book-a")
    createTestDb("book-c")

    const books = listBooks(tmpDir)
    expect(books.map((b) => b.label)).toEqual(["book-a", "book-b", "book-c"])
  })

  it("ignores non-directory entries", () => {
    fs.writeFileSync(path.join(tmpDir, "file.txt"), "hello")
    expect(listBooks(tmpDir)).toEqual([])
  })

  it("ignores directories with invalid labels", () => {
    fs.mkdirSync(path.join(tmpDir, ".hidden"))
    fs.mkdirSync(path.join(tmpDir, "-invalid"))
    expect(listBooks(tmpDir)).toEqual([])
  })
})

describe("getBook", () => {
  it("returns book detail with metadata", () => {
    createTestDb("detail-book")
    addTestPages("detail-book", 5)
    addTestMetadata("detail-book", {
      title: "A Great Book",
      authors: ["Bob", "Carol"],
    })
    createTestPdf("detail-book")

    const book = getBook("detail-book", tmpDir)
    expect(book.label).toBe("detail-book")
    expect(book.title).toBe("A Great Book")
    expect(book.authors).toEqual(["Bob", "Carol"])
    expect(book.pageCount).toBe(5)
    expect(book.hasSourcePdf).toBe(true)
    expect(book.metadata).toEqual({
      title: "A Great Book",
      authors: ["Bob", "Carol"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    })
  })

  it("returns book detail without metadata when not extracted", () => {
    const bookDir = path.join(tmpDir, "new-book")
    fs.mkdirSync(bookDir)
    fs.writeFileSync(path.join(bookDir, "new-book.pdf"), "fake pdf")

    const book = getBook("new-book", tmpDir)
    expect(book.label).toBe("new-book")
    expect(book.title).toBeNull()
    expect(book.metadata).toBeNull()
    expect(book.pageCount).toBe(0)
  })

  it("throws for non-existent book", () => {
    expect(() => getBook("missing", tmpDir)).toThrow("not found")
  })

  it("throws for invalid label", () => {
    expect(() => getBook("-bad", tmpDir)).toThrow()
  })
})

describe("createBook", () => {
  const fakePdf = Buffer.from("%PDF-1.0 fake content")

  it("creates directory and saves PDF", () => {
    const book = createBook("new-book", fakePdf, tmpDir)
    expect(book.label).toBe("new-book")
    expect(book.hasSourcePdf).toBe(true)
    expect(book.pageCount).toBe(0)
    expect(book.title).toBeNull()

    const pdfPath = path.join(tmpDir, "new-book", "new-book.pdf")
    expect(fs.existsSync(pdfPath)).toBe(true)
    expect(fs.readFileSync(pdfPath)).toEqual(fakePdf)
  })

  it("writes config overrides when provided", () => {
    createBook("configured", fakePdf, tmpDir, {
      concurrency: 4,
    })

    const configPath = path.join(tmpDir, "configured", "config.yaml")
    expect(fs.existsSync(configPath)).toBe(true)
    const content = fs.readFileSync(configPath, "utf-8")
    expect(content).toContain("concurrency: 4")
  })

  it("does not write config when no overrides provided", () => {
    createBook("no-config", fakePdf, tmpDir)
    const configPath = path.join(tmpDir, "no-config", "config.yaml")
    expect(fs.existsSync(configPath)).toBe(false)
  })

  it("rejects invalid labels", () => {
    expect(() => createBook("-bad", fakePdf, tmpDir)).toThrow()
    expect(() => createBook(".hidden", fakePdf, tmpDir)).toThrow()
    expect(() => createBook("", fakePdf, tmpDir)).toThrow()
  })

  it("rejects duplicate labels", () => {
    createBook("exists", fakePdf, tmpDir)
    expect(() => createBook("exists", fakePdf, tmpDir)).toThrow(
      "already exists"
    )
  })
})

describe("deleteBook", () => {
  it("removes book directory", () => {
    createTestDb("doomed")
    createTestPdf("doomed")

    deleteBook("doomed", tmpDir)
    expect(fs.existsSync(path.join(tmpDir, "doomed"))).toBe(false)
  })

  it("throws for non-existent book", () => {
    expect(() => deleteBook("ghost", tmpDir)).toThrow("not found")
  })

  it("throws for invalid label", () => {
    expect(() => deleteBook("-bad", tmpDir)).toThrow()
  })
})
