import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, openBookDb } from "@adt/storage"
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

it.each(["page_sectioning:\n  mode: imported-invalid\n", "page_sectioning: ["])("isolates invalid book settings without marking its database for rebuild", malformed => {
  for (const label of ["bad", "good"]) { createTestDb(label); addTestPages(label, 1) }
  const config = path.join(tmpDir, "bad/config.yaml")
  const healthy = listBooks(tmpDir).find(b => b.label === "good")!
  fs.writeFileSync(config, malformed)
  const listed = listBooks(tmpDir)
  expect(listed.find(b => b.label === "bad")).toMatchObject({ readUnavailable: true, readUnavailableReason: "invalid-config", needsRebuild: false })
  expect(listed.find(b => b.label === "good")).toMatchObject({ pageCount: healthy.pageCount, completedStages: healthy.completedStages })
  expect(fs.readFileSync(config, "utf8")).toBe(malformed)
  fs.writeFileSync(config, "page_sectioning:\n  mode: page\n")
  expect(listBooks(tmpDir).find(b => b.label === "bad")?.readUnavailable).toBeUndefined()
  const global = path.join(tmpDir, "global.yaml")
  fs.writeFileSync(global, malformed)
  expect(() => listBooks(tmpDir, global)).toThrow()
})

function createTestPdf(label: string): void {
  fs.writeFileSync(
    path.join(tmpDir, label, `${label}.pdf`),
    Buffer.from("%PDF-1.0 fake")
  )
}

it("isolates a corrupt database, preserves its bytes and healthy books, and recovers after repair", () => {
  for (const label of ["bad", "good"]) { createTestDb(label); addTestPages(label, 2) }
  const db = path.join(tmpDir, "bad/bad.db")
  const original = fs.readFileSync(db)
  const healthy = listBooks(tmpDir).find(book => book.label === "good")!
  const truncated = original.subarray(0, 15)
  fs.writeFileSync(db, truncated)
  expect(listBooks(tmpDir).find(book => book.label === "bad")).toMatchObject({ readUnavailable: true, needsRebuild: false, completedStages: [] })
  expect(listBooks(tmpDir).find(book => book.label === "good")).toEqual(healthy)
  expect(fs.readFileSync(db)).toEqual(truncated)
  fs.writeFileSync(db, original)
  expect(listBooks(tmpDir).find(book => book.label === "bad")).toMatchObject({ pageCount: 2, needsRebuild: false })
  expect(listBooks(tmpDir).find(book => book.label === "bad")?.readUnavailable).toBeUndefined()
})

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
  // F14: one book with an unreadable identity must not break the library.
  it("still lists every book when one identity file is truncated", () => {
    createTestDb("healthy")
    createTestDb("damaged")
    fs.writeFileSync(path.join(tmpDir, "damaged", ".adt-project.json"), '{"version": 1, "projec')
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const books = listBooks(tmpDir)
      expect(books.map((book) => book.label)).toEqual(["damaged", "healthy"])
      expect(books[0].projectId).toMatch(/^[0-9a-f-]{36}$/)
      expect(listBooks(tmpDir)[0].projectId).toBe(books[0].projectId)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it("lists every other book when one folder can't be read at all", () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return
    createTestDb("healthy")
    const bad = path.join(tmpDir, "unreadable")
    fs.mkdirSync(bad)
    fs.chmodSync(bad, 0o000)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(listBooks(tmpDir).map((book) => book.label)).toContain("healthy")
    } finally {
      warn.mockRestore()
      fs.chmodSync(bad, 0o755)
    }
  })

  it("lists a book whose folder can't be written and has no identity yet", () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return
    createTestDb("read-only")
    const bookDir = path.join(tmpDir, "read-only")
    fs.rmSync(path.join(bookDir, ".adt-project.json"), { force: true })
    fs.chmodSync(bookDir, 0o555)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(listBooks(tmpDir).map((book) => book.label)).toEqual(["read-only"])
    } finally {
      warn.mockRestore()
      fs.chmodSync(bookDir, 0o755)
    }
  })

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
      projectId: expect.any(String),
      sourceKind: "pdf",
      workingSource: "pdf",
      sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      needsRebuild: false,
      rebuildReason: null,
      completedStages: [],
      previewStatus: "incomplete",
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
      part: null,
      split: null,
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
      projectId: expect.any(String),
      sourceKind: "unknown",
      workingSource: "unknown",
      sourceFingerprint: null,
      needsRebuild: false,
      rebuildReason: null,
      completedStages: [],
      previewStatus: "incomplete",
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
      part: null,
      split: null,
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
      projectId: expect.any(String),
      sourceKind: "pdf",
      workingSource: "pdf",
      sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      needsRebuild: false,
      rebuildReason: null,
      completedStages: [],
      previewStatus: "incomplete",
      createdAt: expect.any(String),
      modifiedAt: expect.any(String),
      part: null,
      split: null,
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
      "book-outline",
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

  it("does not claim preview completion from an empty adt directory", () => {
    createTestDb("previewable")
    fs.mkdirSync(path.join(tmpDir, "previewable", "adt"))

    const books = listBooks(tmpDir)
    expect(books[0].completedStages).not.toContain("preview")
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

  it("turns TTS text normalization off for a new book", () => {
    createBook("no-config", fakePdf, tmpDir)
    expect(getBookConfig("no-config", tmpDir)).toEqual({
      core_tts: { language_normalization: false },
    })
  })

  it("keeps other core_tts overrides alongside the normalization default", () => {
    createBook("tts-model", fakePdf, tmpDir, {
      core_tts: { model: "openai:gpt-5.4" },
    })
    expect(getBookConfig("tts-model", tmpDir)).toEqual({
      core_tts: { model: "openai:gpt-5.4", language_normalization: false },
    })
  })

  it("lets an explicit override turn TTS text normalization on", () => {
    createBook("tts-on", fakePdf, tmpDir, {
      core_tts: { language_normalization: true },
    })
    expect(getBookConfig("tts-on", tmpDir)).toEqual({
      core_tts: { language_normalization: true },
    })
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
    expect(config).toEqual({
      concurrency: 4,
      core_tts: { language_normalization: false },
    })
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

  it("atomically removes all overrides when the proposed mapping is empty", () => {
    const fakePdf = Buffer.from("%PDF-1.0 fake")
    createBook("remove-config", fakePdf, tmpDir, { concurrency: 4 })
    const configPath = path.join(tmpDir, "remove-config", "config.yaml")
    expect(fs.existsSync(configPath)).toBe(true)

    // The public no-overrides value remains null; the journal uses an atomic
    // empty mapping on disk instead of deleting the file.
    updateBookConfig("remove-config", tmpDir, {})
    expect(getBookConfig("remove-config", tmpDir)).toBeNull()
    expect(fs.readFileSync(configPath, "utf8").trim()).toBe("{}")
  })

  it("persists an empty override mapping when no config exists", () => {
    const bookDir = path.join(tmpDir, "empty-update")
    fs.mkdirSync(bookDir)
    updateBookConfig("empty-update", tmpDir, {})
    expect(getBookConfig("empty-update", tmpDir)).toBeNull()
    expect(fs.readFileSync(path.join(bookDir, "config.yaml"), "utf8").trim()).toBe("{}")
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


it("persists one stable identity when listing a healthy legacy book", () => {
  createTestDb("legacy")
  const identityFile = path.join(tmpDir, "legacy", ".adt-project.json")
  expect(fs.existsSync(identityFile)).toBe(false)
  const first = listBooks(tmpDir).find(book => book.label === "legacy")!
  const bytes = fs.readFileSync(identityFile)
  expect(JSON.parse(bytes.toString()).projectId).toBe(first.projectId)
  expect(listBooks(tmpDir).find(book => book.label === "legacy")!.projectId).toBe(first.projectId)
  expect(fs.readFileSync(identityFile)).toEqual(bytes)
})


it.each(["rewrite", "window", "part", "rollback"])("RAC-13: cold Library verifies on book access and invalidates on %s", change => {
  createTestDb("summary"); addTestPages("summary", 2)
  const bookDir = path.join(tmpDir, "summary")
  const storage = createBookStorage("summary", tmpDir)
  for (const id of ["pg001", "pg002"]) {
    storage.putNodeData("page-sectioning", id, { reasoning: "", sections: [{
      sectionId: id + "_sec001", sectionType: "content", pageNumber: Number(id.slice(2)),
      isPruned: false, backgroundColor: "white", textColor: "black",
      nodes: [{ nodeId: id + "_n001", role: "paragraph", text: "Saved page", isPruned: false }],
    }] })
    storage.putNodeData("web-rendering", id, { sections: [] })
    storage.putNodeData("web-rendering", id, { sections: [{ sectionId: id + "_sec001", sectionIndex: 0,
      sectionType: "content", reasoning: "", html: `<section data-section-id="${id}_sec001"><p data-id="${id}_n001">Saved page</p></section>`,
    }] })
  }
  storage.close()
  markStepsDone("summary", ["web-rendering"])
  expect(listBooks(tmpDir)[0]).toMatchObject({ storyboardVerificationPending: true, completedStages: [], previewStatus: "incomplete" })
  const detail = getBook("summary", tmpDir)
  expect(detail.completedStages).toContain("storyboard")
  const warm = listBooks(tmpDir)[0]
  expect(warm.storyboardVerificationPending).toBeUndefined()
  expect(warm.completedStages).toEqual(detail.completedStages)
  if (change === "rewrite") {
    const db = openBookDb(path.join(bookDir, "summary.db"))
    db.run("UPDATE node_data SET data=? WHERE node=? AND item_id=?", ["{bad", "web-rendering", "pg001"])
    db.close()
  } else if (change === "window") {
    fs.writeFileSync(path.join(bookDir, "config.yaml"), "start_page: 1\nend_page: 1\n")
  } else if (change === "part") {
    fs.writeFileSync(path.join(bookDir, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null,
      range: { startPage: 1, endPage: 1 }, pageCount: 2, fingerprint: {}, identityHash: "id", semanticsHash: "sem",
      createdAt: "test", partLabelSuggestion: "part" }))
  } else {
    const writer = createBookStorage("summary", tmpDir)
    expect(writer.setCurrentNodeVersion("web-rendering", "pg001", 1)).toBe(true)
    writer.close()
  }
  const changed = listBooks(tmpDir)[0]
  expect(changed.storyboardVerificationPending).toBe(true)
  expect(changed.completedStages).not.toContain("storyboard")
  const reopened = getBook("summary", tmpDir)
  if (change === "rewrite" || change === "rollback") expect(reopened.completedStages).not.toContain("storyboard")
  else expect(reopened.completedStages).toContain("storyboard")
  expect(listBooks(tmpDir)[0].storyboardVerificationPending).toBeUndefined()
})

it("reports an existing package as unverified even without completed run telemetry", () => {
  createTestDb("saved-package"); addTestPages("saved-package", 1)
  fs.mkdirSync(path.join(tmpDir, "saved-package", "adt"))
  expect(listBooks(tmpDir)[0]).toMatchObject({ storyboardVerificationPending: true, previewStatus: "unverified", completedStages: [] })
})
