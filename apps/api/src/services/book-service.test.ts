import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
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
    1,
  ])
  db.close()
}

function markStepsDone(label: string, steps: string[]): void {
  const db = openBookDb(path.join(tmpDir, label, `${label}.db`))
  for (const step of steps) {
    db.run(
      "INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'done', ?)",
      [step, new Date().toISOString()]
    )
  }
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
      completedStages: [],
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
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
      completedStages: [],
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
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
      completedStages: [],
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
    })
  })

  it("includes ISO timestamps for creation and last modification", () => {
    createTestDb("timestamps")

    const books = listBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(() => new Date(books[0].createdAt).toISOString()).not.toThrow()
    expect(() => new Date(books[0].modifiedAt).toISOString()).not.toThrow()
    expect(Date.parse(books[0].createdAt)).not.toBeNaN()
    expect(Date.parse(books[0].modifiedAt)).not.toBeNaN()
  })

  it("derives modifiedAt from content files, not the bumped directory mtime", () => {
    // Reproduces the "Last modified resets on every launch" bug: opening a book DB
    // creates/removes a .lock dir inside the book folder, bumping the folder mtime
    // to "now" on POSIX filesystems. modifiedAt must reflect the real .db edit time,
    // not the freshly-bumped directory mtime.
    createTestDb("stale")
    const bookDir = path.join(tmpDir, "stale")
    const dbPath = path.join(bookDir, "stale.db")

    const oldDate = new Date("2020-01-02T03:04:05.000Z")
    fs.utimesSync(dbPath, oldDate, oldDate)
    // Simulate the launch-time directory mtime bump.
    const now = new Date()
    fs.utimesSync(bookDir, now, now)

    const books = listBooks(tmpDir)
    expect(books).toHaveLength(1)
    expect(books[0].modifiedAt).toBe(oldDate.toISOString())
  })

  it("derives createdAt from content files (not ctime) when birthtime is unavailable", () => {
    // On filesystems that don't report a birth time (birthtimeMs === 0), createdAt
    // must fall back to the earliest content mtime, NOT the directory's ctime — which,
    // like its mtime, is bumped to "now" on every launch by the .lock-dir churn.
    createTestDb("nobirth")
    const bookDir = path.join(tmpDir, "nobirth")
    const dbPath = path.join(bookDir, "nobirth.db")

    const oldDate = new Date("2019-05-06T07:08:09.000Z")
    fs.utimesSync(dbPath, oldDate, oldDate)
    // Simulate the launch-time directory mtime bump (ctime moves with it).
    const now = new Date()
    fs.utimesSync(bookDir, now, now)

    // Simulate a filesystem that doesn't expose birthtime for the book directory.
    const realStatSync = fs.statSync.bind(fs)
    const spy = vi
      .spyOn(fs, "statSync")
      .mockImplementation(((p: fs.PathLike, opts?: fs.StatSyncOptions) => {
        const stat = realStatSync(p, opts) as fs.Stats
        if (p === bookDir) stat.birthtimeMs = 0
        return stat
      }) as typeof fs.statSync)

    try {
      const books = listBooks(tmpDir)
      expect(books).toHaveLength(1)
      expect(books[0].createdAt).toBe(oldDate.toISOString())
    } finally {
      spy.mockRestore()
    }
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

  it("reports a stage as completed when all its steps are done", () => {
    createTestDb("extract-done")
    markStepsDone("extract-done", [
      "extract",
      "metadata",
      "image-filtering",
      "image-segmentation",
      "image-cropping",
      "image-meaningfulness",
      "text-classification",
      "book-summary",
      "translation",
    ])

    const books = listBooks(tmpDir)
    expect(books[0].completedStages).toEqual(["extract"])
  })

  it("does not report a stage as completed when a step is missing", () => {
    createTestDb("extract-partial")
    markStepsDone("extract-partial", ["extract", "metadata"])

    const books = listBooks(tmpDir)
    expect(books[0].completedStages).toEqual([])
  })

  it("includes preview when the adt directory exists", () => {
    createTestDb("previewable")
    fs.mkdirSync(path.join(tmpDir, "previewable", "adt"))

    const books = listBooks(tmpDir)
    expect(books[0].completedStages).toContain("preview")
  })

  it("treats skipped steps as completing the stage", () => {
    createTestDb("mixed-statuses")
    const db = openBookDb(path.join(tmpDir, "mixed-statuses", "mixed-statuses.db"))
    db.run(
      "INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'done', ?)",
      ["quiz-generation", new Date().toISOString()]
    )
    db.run(
      "INSERT INTO step_runs (step, status, completed_at) VALUES (?, 'skipped', ?)",
      ["image-captioning", new Date().toISOString()]
    )
    db.close()

    const books = listBooks(tmpDir)
    expect(books[0].completedStages).toEqual(
      expect.arrayContaining(["quizzes", "captions"])
    )
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
