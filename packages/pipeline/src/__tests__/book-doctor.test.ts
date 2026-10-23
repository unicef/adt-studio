import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, openBookDb, readBookSchemaVersion, type Storage } from "@adt/storage"
import { SCHEMA_VERSION } from "@adt/types"
import { diagnoseBook, diagnoseBooks, formatDiagnosis, hasFindings } from "../book-doctor.js"

let root: string
type Leaf = [id: string, text: string]
const page = (pageId: string, pageNumber: number) => ({ pageId, pageNumber, text: "", pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("page"), format: "png", hash: "fixture", width: 100, height: 100 }, images: [] })
const section = (sectionId: string, leaves: Leaf[], sectionType = "content") => ({ sectionId, sectionType, backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false,
  nodes: leaves.map(([nodeId, text]) => ({ nodeId, isPruned: false, role: "body_text", text })) })
const html = (leaves: Leaf[], owner?: string) => `<section${owner ? ` data-section-id="${owner}"` : ""}>${leaves.map(([id, text]) => `<p data-id="${id}">${text}</p>`).join("")}</section>`
const entry = (sectionIndex: number, sectionType: string, markup: string) => ({ sectionIndex, sectionType, reasoning: "fixture", html: markup })
function seed(label: string, build: (db: Storage) => void) {
  const db = createBookStorage(label, root)
  try { build(db) } finally { db.close() }
}
function seedClean(label: string) {
  seed(label, (db) => {
    db.putExtractedPage(page("pg001", 1))
    const leaves: Leaf[] = [["pg001_t001", "Hello"], ["pg001_t002", "World"]]
    db.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [section("pg001_sec001", leaves)] })
    db.putNodeData("web-rendering", "pg001", { sections: [entry(0, "content", html(leaves, "pg001_sec001"))] })
  })
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-doctor-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it("reports a current, owned, conflict-free book as having no findings", () => {
  seedClean("clean")
  const diagnosis = diagnoseBook(root, "clean")
  expect(diagnosis).toMatchObject({ schemaVersion: SCHEMA_VERSION, schemaStatus: "current", staleLockDir: false, writerLease: null, pages: 1, unownedRenderings: [], duplicateTextIds: [] })
  expect(diagnosis.rekeyedCatalogIds.oldOnly).toEqual([])
  expect(hasFindings(diagnosis)).toBe(false)
  expect(formatDiagnosis(diagnosis)).toBe(`clean: schema ${SCHEMA_VERSION} · 1 pages · no findings`)
})

it("lists renderings whose owner cannot be proved, with candidate sections and leaf overlap", () => {
  seed("ambiguous", (db) => {
    db.putExtractedPage(page("pg001", 1))
    // A legacy duplicate: two sections of the same type sharing one leaf id,
    // and two renderings that declare no owner. Neither can be matched.
    db.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [section("pg001_sec001", [["pg001_t001", "Same"]]), section("pg001_sec002", [["pg001_t001", "Same"]])] })
    db.putNodeData("web-rendering", "pg001", { sections: [entry(0, "content", html([["pg001_t001", "Same"]])), entry(1, "content", html([["pg001_t001", "Same"]]))] })
  })
  const diagnosis = diagnoseBook(root, "ambiguous")
  expect(diagnosis.unownedRenderings).toHaveLength(2)
  expect(diagnosis.unownedRenderings[0]).toMatchObject({ pageId: "pg001", sectionIndex: 0, preview: "Same" })
  expect(diagnosis.unownedRenderings[0].candidates.map((candidate) => [candidate.sectionId, candidate.leafOverlap, candidate.leafTotal])).toEqual([["pg001_sec001", 1, 1], ["pg001_sec002", 1, 1]])
  expect(hasFindings(diagnosis)).toBe(true)
  expect(formatDiagnosis(diagnosis)).toContain("rendered sections without a provable owner (omitted from preview/export): 2")
  expect(formatDiagnosis(diagnosis)).toContain('pg001 rendering #0 "Same" → candidates: pg001_sec001 (content, 1/1 leaves), pg001_sec002 (content, 1/1 leaves)')
})

it("reports duplicate text ids whose copies diverged", () => {
  seed("duplicates", (db) => {
    db.putExtractedPage(page("pg001", 1))
    db.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [section("pg001_sec001", [["pg001_t001", "One"]]), section("pg001_sec002", [["pg001_t002", "Two"]])] })
    // The second owned section still carries the first section's leaf id with
    // different text: what an older Duplicate followed by an edit left behind.
    db.putNodeData("web-rendering", "pg001", { sections: [entry(0, "content", html([["pg001_t001", "One"]], "pg001_sec001")), entry(1, "content", html([["pg001_t002", "Two"], ["pg001_t001", "Edited copy"]], "pg001_sec002"))] })
  })
  const diagnosis = diagnoseBook(root, "duplicates")
  expect(diagnosis.unownedRenderings).toEqual([])
  expect(diagnosis.duplicateTextIds).toEqual([{ id: "pg001_t001", pageIds: ["pg001"], texts: 2 }])
  expect(formatDiagnosis(diagnosis)).toContain("duplicate text ids (first copy wins, warning shown): 1")
})

it("reports catalog ids that re-key and counts the translations, audio and preparations that detach", () => {
  seed("rekeyed", (db) => {
    db.putExtractedPage(page("pg001", 1))
    const leaves: Leaf[] = [["pg001_t001", "Body"], ["pg001_sec001_ans_x", "Label"]]
    db.putNodeData("page-sectioning", "pg001", { reasoning: "fixture", sections: [section("pg001_sec001", leaves)] })
    db.putNodeData("web-rendering", "pg001", { sections: [entry(0, "content", html(leaves, "pg001_sec001"))] })
    // The catalog an older version stored keyed the label positionally.
    db.putNodeData("text-catalog", "book", { entries: [{ id: "pg001_t001", text: "Body" }, { id: "pg001_ac001", text: "Label" }] })
    db.putNodeData("text-catalog-translation", "fr", { entries: [{ id: "pg001_t001", text: "Corps" }, { id: "pg001_ac001", text: "Étiquette" }] })
    db.putNodeData("tts", "en", { entries: [{ textId: "pg001_ac001", fileName: "a.mp3" }] })
    db.putNodeData("tts", "fr", { entries: [{ textId: "pg001_ac001", fileName: "b.mp3" }, { textId: "pg001_t001", fileName: "c.mp3" }] })
    db.putNodeData("core-tts-catalog", "en", { entries: [{ id: "pg001_ac001" }] })
  })
  const diagnosis = diagnoseBook(root, "rekeyed")
  expect(diagnosis.rekeyedCatalogIds).toEqual({ oldOnly: ["pg001_ac001"], newOnly: ["pg001_sec001_ans_x"], detachedTranslations: 1, detachedAudio: 2, detachedPreparations: 1 })
  expect(formatDiagnosis(diagnosis)).toContain("catalog ids that re-key on this version: 1 (detached: 1 translations, 2 audio, 1 preparations)")
})

it("reports an older schema without migrating it, and a newer one without opening it", () => {
  seedClean("older")
  seedClean("newer")
  for (const [label, version] of [["older", SCHEMA_VERSION - 1], ["newer", SCHEMA_VERSION + 1]] as const) {
    const db = openBookDb(path.join(root, label, `${label}.db`))
    db.run("UPDATE schema_version SET version = ?", [version])
    db.close()
  }
  const older = diagnoseBook(root, "older")
  expect(older).toMatchObject({ schemaVersion: SCHEMA_VERSION - 1, schemaStatus: "older", pages: 0 })
  expect(formatDiagnosis(older)).toContain(`older than this version's ${SCHEMA_VERSION}; deeper checks skipped`)
  expect(diagnoseBook(root, "newer").schemaStatus).toBe("newer")
  // Still untouched: the read-only reader sees the version the test wrote.
  // (openBookDb would migrate on open, which is the behaviour the doctor avoids.)
  expect(readBookSchemaVersion(path.join(root, "older", "older.db"))).toBe(SCHEMA_VERSION - 1)
  expect(readBookSchemaVersion(path.join(root, "newer", "newer.db"))).toBe(SCHEMA_VERSION + 1)
})

it("reports a stale lock directory and a writer lease without opening the database", () => {
  seedClean("locked")
  fs.mkdirSync(path.join(root, "locked", "locked.db.lock"))
  fs.writeFileSync(path.join(root, "locked", ".book-writer.json"), JSON.stringify({ pid: 4242, host: "laptop" }))
  const diagnosis = diagnoseBook(root, "locked")
  expect(diagnosis).toMatchObject({ staleLockDir: true, writerLease: "pid 4242 on laptop", schemaStatus: "unreadable" })
  expect(diagnosis.error).toContain("stale lock directory locked.db.lock")
  expect(hasFindings(diagnosis)).toBe(true)
})

it("diagnoses every book directory that holds a database, in name order", () => {
  seedClean("b-book")
  seedClean("a-book")
  fs.mkdirSync(path.join(root, "not-a-book"))
  expect(diagnoseBooks(root).map((diagnosis) => diagnosis.label)).toEqual(["a-book", "b-book"])
  expect(diagnoseBooks(path.join(root, "missing"))).toEqual([])
  expect(diagnoseBook(root, "not-a-book").error).toBe("no database file")
})
