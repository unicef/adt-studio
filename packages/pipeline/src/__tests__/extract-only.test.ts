import { afterAll, beforeAll, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import type sqlite from "node-sqlite3-wasm"
import { createBookStorage, openBookDb, recoverBookCopy, writeSectioningLifecycle, SECTIONING_JOURNAL } from "@adt/storage"
import { EXTRACT_OWNED_NODES, EXTRACT_RETAINED_CONFIG_NODES, FONT_REGISTRY_NODE, PIPELINE, PROJECT_IDENTITY_FILE } from "@adt/types"
import type { Storage } from "@adt/storage"
import { extractPDF } from "../pdf-extraction.js"
import { TYPE_SCALE_NODE } from "../type-scale.js"
import { TYPOGRAPHY_NODE } from "../typography.js"

const root = path.resolve(import.meta.dirname, "../../../..")
const dirs: string[] = []
let template: string

/** One real single-page extraction, copied for every case. */
beforeAll(async () => {
  template = fs.mkdtempSync(path.join(os.tmpdir(), "adt-extract-only-"))
  dirs.push(template)
  const storage = createBookStorage("book", template)
  try { await extractPDF({ pdfPath: path.join(root, "tests/fixtures/raven.pdf"), startPage: 1, endPage: 1 }, storage, { emit() {} }) }
  finally { storage.close() }
}, 60_000)
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }) })

function book(): { booksRoot: string; bookDir: string } {
  const booksRoot = fs.mkdtempSync(path.join(os.tmpdir(), "adt-extract-only-"))
  dirs.push(booksRoot)
  fs.cpSync(path.join(template, "book"), path.join(booksRoot, "book"), { recursive: true })
  return { booksRoot, bookDir: path.join(booksRoot, "book") }
}
function withStorage<T>(booksRoot: string, use: (storage: Storage) => T, label = "book"): T {
  const storage = createBookStorage(label, booksRoot)
  try { return use(storage) } finally { storage.close() }
}
function withDb(bookDir: string, use: (db: sqlite.Database) => void): void {
  const db = openBookDb(path.join(bookDir, "book.db"))
  try { use(db) } finally { db.close() }
}
const inspect = (booksRoot: string, label = "book") => withStorage(booksRoot, storage => storage.inspectExtractOnly!(), label)
const image = { pageId: "pg001", version: 1, buffer: Buffer.from("png"), width: 4, height: 4 }
const insertImage = "INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES (?, 'pg001', ?, 'h', 4, 4, ?)"
const identity = (sourceKind: string) => JSON.stringify({ version: 1, projectId: randomUUID(), sourceKind, sourceFingerprint: null, createdAt: new Date().toISOString() })

describe("SPEC-0003 Extract-only inspection", { timeout: 30_000 }, () => {
  it("names every node Extract writes and the configuration it retains", () => {
    expect(EXTRACT_OWNED_NODES).toEqual(expect.arrayContaining([
      ...PIPELINE.find(stage => stage.name === "extract")!.steps.map(step => step.name),
      "positioned-text", "extraction-debug", "spread-suggestions", "font-profile", TYPE_SCALE_NODE,
    ]))
    expect(EXTRACT_RETAINED_CONFIG_NODES).toEqual(expect.arrayContaining([FONT_REGISTRY_NODE, "font-assignment", TYPOGRAPHY_NODE, "legacy-output-baseline"]))
    expect(EXTRACT_OWNED_NODES.filter(node => EXTRACT_RETAINED_CONFIG_NODES.includes(node))).toEqual([])
  })

  it("RAC-20: a book with only Extract output is Extract-only", async () => {
    const extracted = book()
    expect(inspect(extracted.booksRoot)).toEqual({ extractOnly: true })
    // So does a book that has never been extracted.
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "adt-extract-only-"))
    dirs.push(fresh)
    expect(inspect(fresh)).toEqual({ extractOnly: true })

    // Extract edits, retained configuration and pre-Extract bookkeeping.
    const edited = book()
    withStorage(edited.booksRoot, storage => {
      storage.putCroppedImage({ ...image, imageId: "pg001_im001" })
      storage.putSegmentedImage({ ...image, sourceImageId: "pg001_im001", segmentIndex: 1 })
      storage.putNodeData("image-segmentation", "pg001", { segments: [] })
      storage.putNodeData("book-outline", "book", { entries: [] })
      storage.putNodeData(TYPOGRAPHY_NODE, "book", { roles: {} })
      storage.putNodeData("legacy-output-baseline", "book", { version: 1 })
      storage.putNodeData(FONT_REGISTRY_NODE, "book", { fonts: [{ id: "custom", family: "Custom", source: "upload", faces: [{ weight: 400, style: "normal", file: "custom.woff2", format: "woff2" }] }] })
      storage.markStepCompleted("metadata")
      storage.recordStepError("book-summary", "provider failed")
    })
    withDb(edited.bookDir, db => db.run(insertImage, ["pg001_upload001", "images/pg001_upload001.png", "upload"]))
    fs.writeFileSync(path.join(edited.bookDir, "images", "pg001_upload001.png"), "png")
    writeSectioningLifecycle(edited.bookDir, "page", false)
    for (const directory of ["styleguides", "templates", "fonts", ".cache", "prompts"]) fs.mkdirSync(path.join(edited.bookDir, directory))
    fs.writeFileSync(path.join(edited.bookDir, "styleguides", "book-generated.md"), "# Guide")
    fs.writeFileSync(path.join(edited.bookDir, "templates", "two_column.liquid"), "<section></section>")
    fs.writeFileSync(path.join(edited.bookDir, "fonts", "custom.woff2"), "font")
    fs.writeFileSync(path.join(edited.bookDir, ".cache", "entry.json"), "{}")
    fs.writeFileSync(path.join(edited.bookDir, "config.yaml"), "start_page: 1\n")
    fs.writeFileSync(path.join(edited.bookDir, "part.json"), "{}")
    fs.writeFileSync(path.join(edited.bookDir, PROJECT_IDENTITY_FILE), identity("pdf"))
    expect(inspect(edited.booksRoot)).toEqual({ extractOnly: true })

    const failed = book()
    const record = path.join(failed.bookDir, "extraction.json")
    fs.writeFileSync(record, JSON.stringify({ ...JSON.parse(fs.readFileSync(record, "utf8")), status: "failed" }))
    fs.writeFileSync(`${record}.pending`, "{")
    expect(inspect(failed.booksRoot)).toEqual({ extractOnly: true })

    const legacy = book()
    fs.rmSync(path.join(legacy.bookDir, "extraction.json"))
    expect(inspect(legacy.booksRoot)).toEqual({ extractOnly: true })

    // A recovered copy keeps its audit and the original extraction record.
    await recoverBookCopy(extracted.booksRoot, "book", "copy")
    const evidence = fs.readdirSync(path.join(extracted.booksRoot, "copy")).find(name => name.startsWith(".book-recovery-"))!
    expect(fs.readdirSync(path.join(extracted.booksRoot, "copy", evidence))).toContain("extraction.json")
    expect(inspect(extracted.booksRoot, "copy")).toEqual({ extractOnly: true })
  })

  it.each<[string, string, string, (bookDir: string, booksRoot: string) => void]>([
    ["a page-sectioning node", "downstream-output", "node:page-sectioning", (_, booksRoot) => withStorage(booksRoot, storage => storage.putNodeData("page-sectioning", "pg001", { sections: [] }))],
    ["a web-rendering node", "downstream-output", "node:web-rendering", (_, booksRoot) => withStorage(booksRoot, storage => storage.putNodeData("web-rendering", "pg001", { sections: [] }))],
    ["a quiz-generation null version", "downstream-output", "node:quiz-generation", (_, booksRoot) => withStorage(booksRoot, storage => storage.putNodeData("quiz-generation", "book", null))],
    ["a text-catalog node", "downstream-output", "node:text-catalog", (_, booksRoot) => withStorage(booksRoot, storage => storage.putNodeData("text-catalog", "book", { entries: [] }))],
    ["a node that only has a current pointer", "downstream-output", "node:glossary", bookDir => withDb(bookDir, db => db.run("INSERT INTO node_current VALUES ('glossary', 'book', 1)"))],
    ["a step record outside Extract", "downstream-output", "step:page-sectioning", (_, booksRoot) => withStorage(booksRoot, storage => storage.markStepStarted("page-sectioning"))],
    ["a sign-language video row", "downstream-output", "table:sign_language_videos", bookDir => withDb(bookDir, db => db.run("INSERT INTO sign_language_videos VALUES ('v1', NULL, 'videos/v1.mp4', 'v.mp4', 'video/mp4', 1, '2026-01-01')"))],
    ["a history_slots row", "downstream-output", "table:history_slots", bookDir => withDb(bookDir, db => db.run("INSERT INTO history_slots VALUES ('glossary', 'book', 1, 'abc', 0)"))],
    ["a translated image", "downstream-output", "image-source:translate", bookDir => withDb(bookDir, db => db.run(insertImage, ["pg001_im001_tr_es", "images/pg001_im001_tr_es.png", "translate"]))],
    ["a file in videos/", "downstream-output", "directory:videos", bookDir => fs.writeFileSync(path.join(bookDir, "videos", "v1.mp4"), "video")],
    ["an audio file", "downstream-output", "directory:audio", bookDir => { fs.mkdirSync(path.join(bookDir, "audio", "en"), { recursive: true }); fs.writeFileSync(path.join(bookDir, "audio", "en", "a.mp3"), "audio") }],
    ["a ready Sectioning lifecycle", "downstream-output", "file:.sectioning-lifecycle.json", bookDir => writeSectioningLifecycle(bookDir, "dynamic", true)],
    ["a packaged adt/ directory", "downstream-output", "entry:adt", bookDir => fs.mkdirSync(path.join(bookDir, "adt"))],
    ["a parts ledger", "split-coordinator", "entry:parts-ledger.json", bookDir => fs.writeFileSync(path.join(bookDir, "parts-ledger.json"), JSON.stringify({ exported: [] }))],
    ["an imported-ADT identity", "not-pdf-source", "file:.adt-project.json", bookDir => fs.writeFileSync(path.join(bookDir, PROJECT_IDENTITY_FILE), identity("imported-adt"))],
    ["an ADT import marker", "not-pdf-source", "entry:.adt-import-current.json", bookDir => fs.writeFileSync(path.join(bookDir, ".adt-import-current.json"), "{}")],
    ["an unreadable project identity", "unrecognized-content", "file:.adt-project.json", bookDir => fs.writeFileSync(path.join(bookDir, PROJECT_IDENTITY_FILE), "{")],
    ["an unreadable Sectioning lifecycle", "unrecognized-content", "file:.sectioning-lifecycle.json", bookDir => fs.writeFileSync(path.join(bookDir, ".sectioning-lifecycle.json"), "{")],
    ["an unknown top-level file", "unrecognized-content", "entry:owner-notes.txt", bookDir => fs.writeFileSync(path.join(bookDir, "owner-notes.txt"), "notes")],
    ["an unknown top-level directory", "unrecognized-content", "entry:notes", bookDir => fs.mkdirSync(path.join(bookDir, "notes"))],
    ["an unregistered font file", "unrecognized-content", "file:fonts/stray.woff2", bookDir => { fs.mkdirSync(path.join(bookDir, "fonts")); fs.writeFileSync(path.join(bookDir, "fonts", "stray.woff2"), "font") }],
    ["an unknown table", "unrecognized-content", "table:owner_notes", bookDir => withDb(bookDir, db => db.exec("CREATE TABLE owner_notes (id INTEGER PRIMARY KEY)"))],
    ["a symlink", "unrecognized-content", "symlink:linked.pdf", (bookDir, booksRoot) => { fs.writeFileSync(path.join(booksRoot, "target"), "x"); fs.symlinkSync(path.join(booksRoot, "target"), path.join(bookDir, "linked.pdf")) }],
    ["a symlink among the images", "unrecognized-content", "file:images/linked.png", (bookDir, booksRoot) => { fs.writeFileSync(path.join(booksRoot, "target"), "x"); fs.symlinkSync(path.join(booksRoot, "target"), path.join(bookDir, "images", "linked.png")) }],
  ])("RAC-20: each downstream trace refuses: %s", (_name, reason, detail, add) => {
    const { booksRoot, bookDir } = book()
    add(bookDir, booksRoot)
    expect(inspect(booksRoot)).toEqual({ extractOnly: false, reason, detail })
  })

  it("RAC-20: a pending Sectioning transition refuses", () => {
    const { booksRoot, bookDir } = book()
    withStorage(booksRoot, storage => {
      fs.writeFileSync(path.join(bookDir, SECTIONING_JOURNAL), "{}")
      expect(storage.inspectExtractOnly!()).toMatchObject({ extractOnly: false, reason: "unrecognized-content" })
    })
  })

  it("RAC-20: the inspection writes nothing", () => {
    const snapshot = (directory: string, result: Record<string, string> = {}, relative = ""): Record<string, string> => {
      for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
        const file = path.join(relative, entry.name)
        if (entry.isDirectory()) snapshot(directory, result, file)
        result[file] = entry.isFile() ? createHash("sha256").update(fs.readFileSync(path.join(directory, file))).digest("hex") : "directory"
      }
      return result
    }
    for (const refused of [false, true]) {
      const { booksRoot, bookDir } = book()
      if (refused) withStorage(booksRoot, storage => storage.putNodeData("page-sectioning", "pg001", { sections: [] }))
      withStorage(booksRoot, storage => {
        const before = snapshot(bookDir)
        expect(Object.keys(before)).toContain("book.db")
        expect(storage.inspectExtractOnly!().extractOnly).toBe(!refused)
        // Includes the open connection's own lease file, which must not be replaced.
        expect(snapshot(bookDir)).toEqual(before)
      })
    }
  })
})
