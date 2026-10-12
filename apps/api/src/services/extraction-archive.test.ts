import { afterEach, beforeEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { unzipSync, zipSync } from "fflate"
import { createBookStorage, readExtractionManifest, withBookWriter } from "@adt/storage"
import { extractPDF } from "@adt/pipeline"
import { createZipStream } from "./zip-util.js"
import { importProject } from "./import-service.js"

const pdf = path.resolve(import.meta.dirname, "../../../../tests/fixtures/raven.pdf")
let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-extraction-archive-")) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

async function archivedBook() {
  const storage = createBookStorage("book", root)
  try {
    await extractPDF({ pdfPath: pdf, startPage: 1, endPage: 1 }, storage, { emit() {} })
    storage.putNodeData("page-sectioning", "pg001", { manual: "first" })
    storage.putNodeData("page-sectioning", "pg001", { manual: "second" })
  } finally { storage.close() }
  const bookDir = path.join(root, "book")
  fs.mkdirSync(path.join(bookDir, "audio"))
  fs.writeFileSync(path.join(bookDir, "audio/manual.mp3"), "retained recording")
  const archive = await withBookWriter(bookDir, async () => Buffer.from(await new Response(createZipStream(bookDir)).arrayBuffer()))
  return { archive, bookDir }
}

it("retains verifiable extraction when a project import chooses a collision-free label", async () => {
  const { archive, bookDir } = await archivedBook()
  const originalManifest = readExtractionManifest(bookDir)!
  const originalDb = fs.readFileSync(path.join(bookDir, "book.db"))
  const imported = await importProject(archive, root)
  expect(imported.label).toBe("book-2")
  const importedDir = path.join(root, imported.label)
  const storage = createBookStorage(imported.label, root)
  try {
    expect(await extractPDF({ pdfPath: path.join(importedDir, "book-2.pdf"), startPage: 1, endPage: 1 }, storage, { emit() {} })).toBe("reused")
    expect(storage.getAllNodeVersions("page-sectioning", "pg001").map((row) => row.data)).toEqual([{ manual: "first" }, { manual: "second" }])
    expect(fs.readFileSync(path.join(importedDir, "audio/manual.mp3"), "utf8")).toBe("retained recording")
    expect(readExtractionManifest(importedDir)).toEqual({
      ...originalManifest,
      assets: originalManifest.assets.map((asset) => asset.path === "book.pdf" ? { ...asset, path: "book-2.pdf" } : asset),
    })
  } finally { storage.close() }
  expect(fs.readFileSync(path.join(bookDir, "book.db"))).toEqual(originalDb)
  expect(readExtractionManifest(bookDir)).toEqual(originalManifest)
})

it.each([
  ["./.book-writer.json", "./.book-writer.json.recovery"],
  ["nested/../.book-writer.json", "nested/../.book-writer.json.recovery"],
  [".BOOK-WRITER.JSON", ".BOOK-WRITER.JSON.RECOVERY"],
  [".book-writer.json. ", ".book-writer.json.recovery. "],
])("does not import writer ownership through the %s path alias", async (writer, recovery) => {
  const { archive } = await archivedBook()
  const entries = unzipSync(archive)
  entries[writer] = Buffer.from("untrusted writer ownership")
  entries[recovery] = Buffer.from("untrusted recovery")
  const imported = await importProject(Buffer.from(zipSync(entries)), root)
  const importedDir = path.join(root, imported.label)
  expect(fs.existsSync(path.join(importedDir, ".book-writer.json"))).toBe(false)
  expect(fs.existsSync(path.join(importedDir, ".book-writer.json.recovery"))).toBe(false)
  expect(fs.readdirSync(importedDir).some((name) => name.toLowerCase().startsWith(".book-writer"))).toBe(false)
  expect(withBookWriter(importedDir, () => "admitted")).toBe("admitted")
})


it("rejects a corrupt manifest-owned asset on import and preserves the existing book", async () => {
  const { archive, bookDir } = await archivedBook()
  const originalDb = fs.readFileSync(path.join(bookDir, "book.db"))
  const entries = unzipSync(archive)
  const manifest = readExtractionManifest(bookDir)!
  const image = manifest.images[0].path
  entries[image] = Buffer.from("corrupt extracted image")
  await expect(importProject(Buffer.from(zipSync(entries)), root)).rejects.toMatchObject({ code: "EXTRACTION_ASSETS_INVALID" })
  expect(fs.existsSync(path.join(root, "book-2"))).toBe(false)
  expect(fs.readFileSync(path.join(bookDir, "book.db"))).toEqual(originalDb)
  expect(readExtractionManifest(bookDir)).toEqual(manifest)
})
