import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage } from "@adt/storage"
import { exportProject } from "./export-service.js"
import { previewMerge, mergePart, importPart, isPartArchive, gapsOf, contiguousRanges } from "./part-service.js"

let tmpDir: string
let configPath: string

const PDF_BYTES = Buffer.from("%PDF-1.7\nfake but byte-stable content\n")

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-part-service-"))
  // Minimal base config satisfying AppConfig; book overrides merge on top.
  configPath = path.join(tmpDir, "base-config.yaml")
  fs.writeFileSync(
    configPath,
    "structure_types:\n  paragraph: Paragraph\nrole_types:\n  heading: Heading\n",
  )
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

/** Create a book directory with a PDF, config overrides and an empty DB. */
function makeBook(label: string, overrides = "concurrency: 4\n"): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  fs.writeFileSync(path.join(bookDir, `${label}.pdf`), PDF_BYTES)
  fs.writeFileSync(path.join(bookDir, "config.yaml"), overrides)
  openBookDb(path.join(bookDir, `${label}.db`)).close()
}

/** Add a page with a page-sectioning result, via the storage layer. */
function addProcessedPage(label: string, pageNumber: number): void {
  const pageId = `pg${String(pageNumber).padStart(3, "0")}`
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putExtractedPage({
      pageId,
      pageNumber,
      text: `Page ${pageNumber}`,
      pageImage: {
        imageId: `${pageId}_page`,
        buffer: Buffer.from(`png-${pageNumber}`),
        format: "png",
        hash: `h${pageNumber}`,
        width: 100,
        height: 100,
      },
      images: [],
    })
    storage.putNodeData("page-sectioning", pageId, {
      reasoning: "ok",
      sections: [{ sectionId: `${pageId}_sec001`, sectionType: "content", nodes: [], pageNumber }],
    })
    storage.markStepCompleted("page-sectioning")
  } finally {
    storage.close()
  }
}

/** Mark the per-page-stage steps a contributor would have run as done. */
function markPartStepsDone(label: string): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (const step of ["extract", "metadata", "book-summary", "page-sectioning", "web-rendering"]) {
      storage.markStepCompleted(step)
    }
  } finally {
    storage.close()
  }
}

function writePartManifest(label: string, startPage: number, endPage: number): void {
  fs.writeFileSync(
    path.join(tmpDir, label, "part.json"),
    JSON.stringify({
      adtPart: 1,
      sourceLabel: "raven",
      title: null,
      range: { startPage, endPage },
      pageCount: 10,
      fingerprint: {},
      identityHash: "advisory",
      semanticsHash: "advisory",
      createdAt: "2026-06-22T00:00:00.000Z",
      partLabelSuggestion: label,
    }),
  )
}

/** Seed the book-level metadata node a contributor's extract would produce. */
function addBookMetadata(label: string, title: string): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    storage.putNodeData("metadata", "book", {
      title,
      authors: ["Edgar Allan Poe"],
      publisher: "Raven Press",
      language_code: "en",
      cover_page_number: 1,
      reasoning: "test",
    })
  } finally {
    storage.close()
  }
}

/** Build a "completed part" project zip for pages [start..end]. */
async function buildCompletedPart(
  label: string,
  start: number,
  end: number,
  overrides = "concurrency: 4\n",
  metadataTitle?: string,
): Promise<Buffer> {
  makeBook(label, `${overrides}start_page: ${start}\nend_page: ${end}\n`)
  for (let n = start; n <= end; n++) addProcessedPage(label, n)
  if (metadataTitle !== undefined) addBookMetadata(label, metadataTitle)
  markPartStepsDone(label)
  writePartManifest(label, start, end)
  // a content-addressed cache entry to verify it is carried over
  fs.mkdirSync(path.join(tmpDir, label, ".cache"), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, label, ".cache", "deadbeef.json"), '{"cached":true}')
  const result = await exportProject(label, tmpDir)
  return streamToBuffer(result.stream)
}

function targetDb(label: string) {
  return openBookDb(path.join(tmpDir, label, `${label}.db`))
}

describe("previewMerge", () => {
  it("classifies added pages and matches identity for the same PDF + config", async () => {
    makeBook("raven")
    addProcessedPage("raven", 1)
    addProcessedPage("raven", 2)

    const zip = await buildCompletedPart("raven-p003-004", 3, 4)
    const preview = previewMerge("raven", tmpDir, zip, configPath)

    expect(preview.identityMatch).toBe(true)
    expect(preview.blocked).toBe(false)
    expect(preview.addedPageNumbers).toEqual([3, 4])
    expect(preview.replacedPageNumbers).toEqual([])
    expect(preview.coverage.find((c) => c.node === "page-sectioning")?.pages).toBe(2)
  })

  it("blocks when the PDF differs (identity mismatch)", async () => {
    makeBook("raven")
    addProcessedPage("raven", 1)

    const zip = await buildCompletedPart("raven-p002-002", 2, 2)
    // Corrupt the target's PDF so identity no longer matches.
    fs.writeFileSync(path.join(tmpDir, "raven", "raven.pdf"), Buffer.from("%PDF different"))

    const preview = previewMerge("raven", tmpDir, zip, configPath)
    expect(preview.identityMatch).toBe(false)
    expect(preview.blocked).toBe(true)
    expect(preview.blockReason).toMatch(/different PDF/i)
  })

  it("warns when per-page prompts differ (semantics mismatch)", async () => {
    makeBook("raven", "concurrency: 4\nvisual_review_prompt: review_a\n")
    addProcessedPage("raven", 1)

    const zip = await buildCompletedPart(
      "raven-p002-002",
      2,
      2,
      "concurrency: 4\nvisual_review_prompt: review_b\n",
    )
    const preview = previewMerge("raven", tmpDir, zip, configPath)
    expect(preview.identityMatch).toBe(true)
    expect(preview.semanticsMatch).toBe(false)
    expect(preview.warnings.length).toBeGreaterThan(0)
  })
})

describe("mergePart", () => {
  it("copies per-page data, carries cache, and marks book-level steps stale", async () => {
    makeBook("raven")
    addProcessedPage("raven", 1)
    addProcessedPage("raven", 2)
    // A book-level step that should be cleared by the merge.
    {
      const db = targetDb("raven")
      db.run("INSERT INTO step_runs (step, status) VALUES ('glossary', 'done')")
      db.close()
    }

    const zip = await buildCompletedPart("raven-p003-004", 3, 4)
    const result = mergePart("raven", tmpDir, zip, {}, configPath)

    expect(result.addedPages).toBe(2)
    expect(result.replacedPages).toBe(0)

    const db = targetDb("raven")
    try {
      const pages = db.all("SELECT page_id FROM pages ORDER BY page_number") as Array<{ page_id: string }>
      expect(pages.map((p) => p.page_id)).toEqual(["pg001", "pg002", "pg003", "pg004"])

      const v = db.all(
        "SELECT version FROM node_data WHERE node = 'page-sectioning' AND item_id = 'pg003'",
      ) as Array<{ version: number }>
      expect(v).toEqual([{ version: 1 }])

      // Downstream/book-level stages are cleared (flagged for re-run).
      const glossary = db.all("SELECT status FROM step_runs WHERE step = 'glossary'")
      expect(glossary).toEqual([])

      // Per-page stages are carried from the part and stay complete...
      const sectioning = db.all(
        "SELECT status FROM step_runs WHERE step = 'page-sectioning'",
      ) as Array<{ status: string }>
      expect(sectioning).toEqual([{ status: "done" }])

      // ...including book-summary, which lives in the Extract stage and must
      // NOT be cleared (else the whole Extract stage reads as "not run").
      const bookSummary = db.all(
        "SELECT status FROM step_runs WHERE step = 'book-summary'",
      ) as Array<{ status: string }>
      expect(bookSummary).toEqual([{ status: "done" }])
    } finally {
      db.close()
    }

    // Carried cache + page image files.
    expect(fs.existsSync(path.join(tmpDir, "raven", ".cache", "deadbeef.json"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "raven", "images", "pg003_page.png"))).toBe(true)
  })

  it("populates book metadata from the page-1 part when the target lacks it", async () => {
    makeBook("raven") // split-coordinator book: never extracted, no metadata
    {
      const db = targetDb("raven")
      const meta = db.all("SELECT 1 FROM node_data WHERE node = 'metadata' AND item_id = 'book'")
      expect(meta).toEqual([]) // precondition: no metadata yet
      db.close()
    }

    const zip = await buildCompletedPart("raven-p001-004", 1, 4, "concurrency: 4\n", "The Raven")
    const result = mergePart("raven", tmpDir, zip, {}, configPath)

    expect(result.metadataMerged).toBe(true)
    const db = targetDb("raven")
    try {
      const rows = db.all(
        "SELECT data FROM node_data WHERE node = 'metadata' AND item_id = 'book' ORDER BY version DESC LIMIT 1",
      ) as Array<{ data: string }>
      expect(rows).toHaveLength(1)
      const meta = JSON.parse(rows[0].data)
      expect(meta.title).toBe("The Raven")
      expect(meta.authors).toEqual(["Edgar Allan Poe"])
      expect(meta.publisher).toBe("Raven Press")
    } finally {
      db.close()
    }
  })

  it("does NOT take metadata from a mid-book part (only the page-1 part is authoritative)", async () => {
    makeBook("raven")
    // A part covering pages 3–4 carries metadata derived from its own first
    // pages — not the real book metadata, so the merge must ignore it.
    const zip = await buildCompletedPart("raven-p003-004", 3, 4, "concurrency: 4\n", "Wrong Title")
    const result = mergePart("raven", tmpDir, zip, {}, configPath)

    expect(result.metadataMerged).toBe(false)
    const db = targetDb("raven")
    try {
      const meta = db.all("SELECT 1 FROM node_data WHERE node = 'metadata' AND item_id = 'book'")
      expect(meta).toEqual([])
    } finally {
      db.close()
    }
  })

  it("does not clobber existing target metadata when re-merging the page-1 part", async () => {
    makeBook("raven")
    addBookMetadata("raven", "Coordinator Edited Title") // pretend a prior merge/edit set it

    const zip = await buildCompletedPart("raven-p001-004", 1, 4, "concurrency: 4\n", "Part Title")
    const result = mergePart("raven", tmpDir, zip, {}, configPath)

    expect(result.metadataMerged).toBe(false)
    const db = targetDb("raven")
    try {
      const rows = db.all(
        "SELECT data FROM node_data WHERE node = 'metadata' AND item_id = 'book' ORDER BY version DESC LIMIT 1",
      ) as Array<{ data: string }>
      expect(JSON.parse(rows[0].data).title).toBe("Coordinator Edited Title")
    } finally {
      db.close()
    }
  })

  it("creates a new version on re-submission (overlap → replaced)", async () => {
    makeBook("raven")
    const zip1 = await buildCompletedPart("raven-p001-001", 1, 1)
    mergePart("raven", tmpDir, zip1, {}, configPath)

    // Re-submit the same window.
    const zip2 = await buildCompletedPart("raven-p001-001b", 1, 1)
    const preview = previewMerge("raven", tmpDir, zip2, configPath)
    expect(preview.replacedPageNumbers).toEqual([1])

    const result = mergePart("raven", tmpDir, zip2, {}, configPath)
    expect(result.replacedPages).toBe(1)

    const db = targetDb("raven")
    try {
      const versions = db.all(
        "SELECT version FROM node_data WHERE node = 'page-sectioning' AND item_id = 'pg001' ORDER BY version",
      ) as Array<{ version: number }>
      expect(versions.map((v) => v.version)).toEqual([1, 2])
    } finally {
      db.close()
    }
  })

  it("hard-fails the merge when identity does not match", async () => {
    makeBook("raven")
    const zip = await buildCompletedPart("raven-p002-002", 2, 2)
    fs.writeFileSync(path.join(tmpDir, "raven", "raven.pdf"), Buffer.from("%PDF different"))

    expect(() => mergePart("raven", tmpDir, zip, {}, configPath)).toThrow(/different PDF/i)
  })

  it("requires acknowledgement on semantics mismatch", async () => {
    makeBook("raven", "concurrency: 4\nvisual_review_prompt: review_a\n")
    const zip = await buildCompletedPart(
      "raven-p002-002",
      2,
      2,
      "concurrency: 4\nvisual_review_prompt: review_b\n",
    )

    expect(() => mergePart("raven", tmpDir, zip, {}, configPath)).toThrow()
    // With acknowledgement it proceeds.
    const result = mergePart("raven", tmpDir, zip, { acknowledgeSemanticsMismatch: true }, configPath)
    expect(result.semanticsOverridden).toBe(true)
    expect(result.addedPages).toBe(1)
  })
})

describe("importPart", () => {
  it("creates a book from a lightweight part archive and remembers it is a part", async () => {
    // Build a lightweight part archive by hand (pdf + config + manifest, no db).
    const enc = new TextEncoder()
    const { zipSync } = await import("fflate")
    const manifest = {
      adtPart: 1 as const,
      sourceLabel: "raven",
      title: "Raven",
      range: { startPage: 3, endPage: 4 },
      pageCount: 10,
      fingerprint: {},
      identityHash: "x",
      semanticsHash: "y",
      createdAt: "2026-06-22T00:00:00.000Z",
      partLabelSuggestion: "raven-p003-004",
    }
    const zip = Buffer.from(
      zipSync({
        "part.json": enc.encode(JSON.stringify(manifest)),
        "raven.pdf": new Uint8Array(PDF_BYTES),
        "config.yaml": enc.encode("concurrency: 4\nstart_page: 3\nend_page: 4\n"),
      }),
    )

    expect(isPartArchive(zip)).toBe(true)
    const book = importPart(zip, tmpDir)
    expect(book.label).toBe("raven-p003-004")

    const bookDir = path.join(tmpDir, "raven-p003-004")
    expect(fs.existsSync(path.join(bookDir, "raven-p003-004.pdf"))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, "part.json"))).toBe(true)
    const cfg = fs.readFileSync(path.join(bookDir, "config.yaml"), "utf-8")
    expect(cfg).toContain("start_page: 3")
  })
})

describe("split tracking range math", () => {
  it("gapsOf returns un-covered ranges, advancing past exported parts", () => {
    // Nothing exported yet → the whole book is the gap.
    expect(gapsOf([], 19)).toEqual([{ startPage: 1, endPage: 19 }])
    // 1–10 exported → next gap is 11–19.
    expect(gapsOf([{ startPage: 1, endPage: 10 }], 19)).toEqual([{ startPage: 11, endPage: 19 }])
    // Only the tail exported → the front 1–10 is the gap.
    expect(gapsOf([{ startPage: 11, endPage: 19 }], 19)).toEqual([{ startPage: 1, endPage: 10 }])
    // Fully covered (even with overlap) → no gaps.
    expect(gapsOf([{ startPage: 1, endPage: 12 }, { startPage: 10, endPage: 19 }], 19)).toEqual([])
  })

  it("contiguousRanges collapses present page numbers", () => {
    expect(contiguousRanges([1, 2, 3, 11, 12])).toEqual([
      { startPage: 1, endPage: 3 },
      { startPage: 11, endPage: 12 },
    ])
    expect(contiguousRanges([])).toEqual([])
    expect(contiguousRanges([5, 5, 4])).toEqual([{ startPage: 4, endPage: 5 }])
  })
})
