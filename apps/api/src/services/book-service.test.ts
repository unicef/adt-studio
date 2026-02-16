import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb } from "@adt/storage"
import { SCHEMA_VERSION } from "@adt/types"
import {
  listBooks,
  getBook,
  createBook,
  deleteBook,
  getBookConfig,
  updateBookConfig,
  acceptStoryboard,
} from "./book-service.js"

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

function addTestRenderings(label: string, count: number): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  for (let i = 1; i <= count; i++) {
    const pageId = `pg${String(i).padStart(3, "0")}`
    db.run(
      "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
      [
        "web-rendering",
        pageId,
        1,
        JSON.stringify({ sections: [{ html: `<p>Page ${i}</p>` }] }),
      ]
    )
  }
  db.close()
}

function createLegacySchemaDb(label: string): void {
  createTestDb(label)
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  db.run("UPDATE schema_version SET version = ? WHERE id = 1", [
    SCHEMA_VERSION - 1,
  ])
  db.close()
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
      publisher: null,
      languageCode: "en",
      pageCount: 3,
      hasSourcePdf: true,
      needsRebuild: false,
      rebuildReason: null,
      storyboardAccepted: false,
      proofCompleted: false,
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
      publisher: null,
      languageCode: null,
      pageCount: 0,
      hasSourcePdf: false,
      needsRebuild: false,
      rebuildReason: null,
      storyboardAccepted: false,
      proofCompleted: false,
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
      publisher: null,
      languageCode: null,
      pageCount: 0,
      hasSourcePdf: true,
      needsRebuild: false,
      rebuildReason: null,
      storyboardAccepted: false,
      proofCompleted: false,
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

  it("marks books with old schema as needing rebuild", () => {
    createLegacySchemaDb("old-book")
    createTestPdf("old-book")

    const books = listBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0].label).toBe("old-book")
    expect(books[0].needsRebuild).toBe(true)
    expect(books[0].rebuildReason).toContain("older storage schema")
    expect(books[0].hasSourcePdf).toBe(true)
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
    expect(book.needsRebuild).toBe(false)
    expect(book.rebuildReason).toBeNull()
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
    expect(book.needsRebuild).toBe(false)
    expect(book.rebuildReason).toBeNull()
  })

  it("returns a rebuild marker for old schema books", () => {
    createLegacySchemaDb("old-book")
    createTestPdf("old-book")

    const book = getBook("old-book", tmpDir)
    expect(book.label).toBe("old-book")
    expect(book.needsRebuild).toBe(true)
    expect(book.rebuildReason).toContain("older storage schema")
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
    expect(book.needsRebuild).toBe(false)
    expect(book.rebuildReason).toBeNull()

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

describe("getBookConfig", () => {
  it("returns null when no config.yaml exists", () => {
    const bookDir = path.join(tmpDir, "no-config")
    fs.mkdirSync(bookDir)
    expect(getBookConfig("no-config", tmpDir)).toBeNull()
  })

  it("returns parsed config when config.yaml exists", () => {
    const fakePdf = Buffer.from("%PDF-1.0 fake")
    createBook("with-config", fakePdf, tmpDir, { concurrency: 4 })
    const config = getBookConfig("with-config", tmpDir)
    expect(config).toEqual({ concurrency: 4 })
  })

  it("throws for non-existent book", () => {
    expect(() => getBookConfig("ghost", tmpDir)).toThrow("not found")
  })

  it("throws for invalid label", () => {
    expect(() => getBookConfig("-bad", tmpDir)).toThrow()
  })
})

describe("updateBookConfig", () => {
  it("writes config.yaml with overrides", () => {
    const bookDir = path.join(tmpDir, "update-test")
    fs.mkdirSync(bookDir)
    updateBookConfig("update-test", tmpDir, { concurrency: 8 })
    const configPath = path.join(bookDir, "config.yaml")
    expect(fs.existsSync(configPath)).toBe(true)
    const content = fs.readFileSync(configPath, "utf-8")
    expect(content).toContain("concurrency: 8")
  })

  it("removes config.yaml when overrides are empty", () => {
    const fakePdf = Buffer.from("%PDF-1.0 fake")
    createBook("remove-config", fakePdf, tmpDir, { concurrency: 4 })
    const configPath = path.join(tmpDir, "remove-config", "config.yaml")
    expect(fs.existsSync(configPath)).toBe(true)

    updateBookConfig("remove-config", tmpDir, {})
    expect(fs.existsSync(configPath)).toBe(false)
  })

  it("is a no-op when overrides are empty and no config exists", () => {
    const bookDir = path.join(tmpDir, "empty-update")
    fs.mkdirSync(bookDir)
    updateBookConfig("empty-update", tmpDir, {})
    expect(fs.existsSync(path.join(bookDir, "config.yaml"))).toBe(false)
  })

  it("throws for non-existent book", () => {
    expect(() => updateBookConfig("ghost", tmpDir, { concurrency: 2 })).toThrow(
      "not found"
    )
  })

  it("throws for invalid label", () => {
    expect(() => updateBookConfig("-bad", tmpDir, {})).toThrow()
  })
})

describe("acceptStoryboard", () => {
  it("succeeds when all pages have renderings", () => {
    createTestDb("accept-book")
    addTestPages("accept-book", 3)
    addTestRenderings("accept-book", 3)

    const result = acceptStoryboard("accept-book", tmpDir)
    expect(result.version).toBeGreaterThanOrEqual(1)
    expect(result.acceptedAt).toBeTypeOf("string")
  })

  it("marks book as storyboardAccepted in listBooks", () => {
    createTestDb("accepted")
    addTestPages("accepted", 2)
    addTestRenderings("accepted", 2)
    addTestMetadata("accepted", { title: "Accepted Book", authors: [] })
    createTestPdf("accepted")

    acceptStoryboard("accepted", tmpDir)

    const books = listBooks(tmpDir)
    expect(books[0].storyboardAccepted).toBe(true)
  })

  it("marks book as storyboardAccepted in getBook", () => {
    createTestDb("accepted-detail")
    addTestPages("accepted-detail", 2)
    addTestRenderings("accepted-detail", 2)
    createTestPdf("accepted-detail")

    acceptStoryboard("accepted-detail", tmpDir)

    const book = getBook("accepted-detail", tmpDir)
    expect(book.storyboardAccepted).toBe(true)
  })

  it("throws when some pages are not rendered", () => {
    createTestDb("partial")
    addTestPages("partial", 3)
    addTestRenderings("partial", 1) // only 1 of 3 rendered

    expect(() => acceptStoryboard("partial", tmpDir)).toThrow(
      "Not all pages have been rendered"
    )
  })

  it("throws when book has no pages", () => {
    createTestDb("no-pages")

    expect(() => acceptStoryboard("no-pages", tmpDir)).toThrow(
      "No pages found"
    )
  })

  it("increments version on re-accept", () => {
    createTestDb("re-accept")
    addTestPages("re-accept", 2)
    addTestRenderings("re-accept", 2)

    const first = acceptStoryboard("re-accept", tmpDir)
    const second = acceptStoryboard("re-accept", tmpDir)
    expect(second.version).toBe(first.version + 1)
  })

  it("throws for non-existent book", () => {
    expect(() => acceptStoryboard("ghost", tmpDir)).toThrow("not found")
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
