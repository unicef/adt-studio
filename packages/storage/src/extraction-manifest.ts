import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import sqlite from "node-sqlite3-wasm"
import { BookFontRegistry, FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID, ExtractionManifest, type ExtractionInputs } from "@adt/types"
import { assertBookWriter } from "./book-writer.js"
import { ExtractionAdmissionError } from "./extraction-error.js"

export const EXTRACTION_MANIFEST_FILE = "extraction.json"
export const extractionHash = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex")

export function readExtractionManifest(bookDir: string): ExtractionManifest | null {
  const file = path.join(bookDir, EXTRACTION_MANIFEST_FILE)
  if (!fs.existsSync(file)) return null
  try { return ExtractionManifest.parse(JSON.parse(fs.readFileSync(file, "utf8"))) }
  catch { throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE") }
}

/** Atomic publication; the previous extracting record survives any failed write. */
export function writeExtractionManifest(bookDir: string, manifest: ExtractionManifest): void {
  assertBookWriter(bookDir)
  const data = ExtractionManifest.parse(manifest)
  const file = path.join(bookDir, EXTRACTION_MANIFEST_FILE)
  const temporary = `${file}.pending`
  const fd = fs.openSync(temporary, "w", 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd) }
  finally { fs.closeSync(fd) }
  fs.renameSync(temporary, file)
  syncDirectory(bookDir)
}

export function syncDirectory(directory: string): void {
  // Windows does not support opening directories for fsync. Files are still
  // flushed before publication; rename remains atomic on the same filesystem.
  if (process.platform === "win32") return
  const fd = fs.openSync(directory, "r")
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

function assetPath(bookDir: string, relative: string): string {
  const root = fs.realpathSync(bookDir)
  const candidate = path.resolve(root, relative)
  if (!candidate.startsWith(root + path.sep)) throw new Error("Invalid asset path")
  const actual = fs.realpathSync(candidate)
  if (!actual.startsWith(root + path.sep) || !fs.statSync(actual).isFile()) throw new Error("Invalid asset path")
  return actual
}

export function hashExtractionAsset(bookDir: string, relative: string): string {
  return extractionHash(fs.readFileSync(assetPath(bookDir, relative)))
}

/** Flush extraction files before making a complete manifest visible. */
export function flushExtractionAsset(bookDir: string, relative: string): void {
  // Windows FlushFileBuffers requires a writable handle; r+ never truncates.
  const fd = fs.openSync(assetPath(bookDir, relative), "r+")
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

function readDatabase<T>(bookDir: string, read: (db: sqlite.Database) => T): T {
  const file = path.join(bookDir, `${path.basename(bookDir)}.db`)
  const db = new sqlite.Database(file, { readOnly: true, fileMustExist: true })
  try { return read(db) } finally { db.close() }
}

function assertInitialDestination(bookDir: string, sourceHash: string): void {
  const label = path.basename(bookDir)
  const allowedFiles = new Set([`${label}.pdf`, `${label}.db`, `${label}.db-wal`, `${label}.db-shm`, "config.yaml", "part.json", ".book-writer.json"])
  const emptyDirectories = new Set(["images", ".debug-images", "videos", `${label}.db.lock`, ".book-writer.json.recovery"])
  const fontFiles = new Set<string>()
  for (const entry of fs.readdirSync(bookDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new ExtractionAdmissionError("EXTRACTION_LEGACY")
    if (entry.isDirectory() && entry.name === "fonts") {
      // Uploaded fonts are initial configuration inputs, but the directory is
      // not a blanket exception for unknown content or symlinks. Validate its
      // files against retained registry versions below, without changing either.
      for (const font of fs.readdirSync(path.join(bookDir, "fonts"), { withFileTypes: true })) {
        if (!font.isFile()) throw new ExtractionAdmissionError("EXTRACTION_LEGACY")
        fontFiles.add(font.name)
      }
      continue
    }
    // Cache and local prompt overrides are inputs, not an extraction history.
    if (entry.isDirectory() && [".cache", "prompts"].includes(entry.name)) continue
    if (entry.isDirectory() && emptyDirectories.has(entry.name) && fs.readdirSync(path.join(bookDir, entry.name)).length === 0) continue
    if (!entry.isFile() || !allowedFiles.has(entry.name)) throw new ExtractionAdmissionError("EXTRACTION_LEGACY")
  }
  const pdf = path.join(bookDir, `${label}.pdf`)
  if (fs.existsSync(pdf) && extractionHash(fs.readFileSync(pdf)) !== sourceHash) throw new ExtractionAdmissionError("EXTRACTION_SOURCE_CHANGED")
  if (!fs.existsSync(path.join(bookDir, `${label}.db`))) {
    if (fontFiles.size) throw new ExtractionAdmissionError("EXTRACTION_LEGACY")
    return
  }
  try {
    readDatabase(bookDir, (db) => {
      if (fontFiles.size) {
        const rows = db.all("SELECT data FROM node_data WHERE node = ? AND item_id = ?", [FONT_REGISTRY_NODE, FONT_REGISTRY_ITEM_ID]) as Array<{ data: string }>
        const registered = new Set(rows.flatMap((row) => BookFontRegistry.parse(JSON.parse(row.data)).fonts
          .filter((font) => font.source === "upload").flatMap((font) => font.faces.map((face) => face.file))))
        if ([...fontFiles].some((file) => !registered.has(file))) throw new ExtractionAdmissionError("EXTRACTION_LEGACY")
      }
      const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'") as Array<{ name: string }>
      for (const { name } of tables) {
        if (name === "schema_version") continue
        const query = name === "node_data" || name === "node_current"
          ? `SELECT 1 FROM ${name} WHERE node NOT IN ('metadata', 'font-registry', 'font-assignment') LIMIT 1`
          : `SELECT 1 FROM "${name.replaceAll('"', '""')}" LIMIT 1`
        if (db.get(query)) throw new ExtractionAdmissionError("EXTRACTION_LEGACY")
      }
    })
  } catch { throw new ExtractionAdmissionError("EXTRACTION_LEGACY") }
}

export function verifyExtractionInventory(bookDir: string, manifest: ExtractionManifest): void {
  try {
    const pageIds = new Set(manifest.pages.map((page) => page.pageId))
    const assetPaths = new Set(manifest.assets.map((asset) => asset.path))
    const imageIds = new Set(manifest.images.map((image) => image.imageId))
    const nodeKeys = new Set(manifest.nodes.map((node) => `${node.node}/${node.itemId}`))
    if (manifest.assets.length !== manifest.images.length + 1) throw new Error("Asset inventory incomplete")
    if (!manifest.assets.some((asset) => asset.path === `${path.basename(bookDir)}.pdf` && asset.hash === manifest.sourceHash)) throw new Error("Source inventory missing")
    for (const image of manifest.images) {
      if (!pageIds.has(image.pageId) || !assetPaths.has(image.path)) throw new Error("Image inventory incomplete")
    }
    const requiredNodes = [
      ["metadata", "book"], ["spread-suggestions", "book"], ["font-profile", "book"],
      ...manifest.pages.map((page) => ["positioned-text", page.pageId]),
    ]
    for (const [node, itemId] of requiredNodes) {
      if (!nodeKeys.has(`${node}/${itemId}`)) throw new Error("Metadata inventory incomplete")
    }
    for (const asset of manifest.assets) {
      if (hashExtractionAsset(bookDir, asset.path) !== asset.hash) throw new Error("Asset mismatch")
    }
    readDatabase(bookDir, (db) => {
      const pages = db.all("SELECT page_id, page_number, text FROM pages ORDER BY page_number, page_id") as Array<{ page_id: string; page_number: number; text: string }>
      if (pages.length !== manifest.pages.length) throw new Error("Page inventory mismatch")
      for (const [index, page] of pages.entries()) {
        const expected = manifest.pages[index]
        if (page.page_id !== expected.pageId || page.page_number !== expected.pageNumber || extractionHash(page.text) !== expected.textHash) throw new Error("Page mismatch")
      }
      // Compare the original immutable versions, never the editor-owned current
      // pointer. Editing positioned text or adding crops does not rewrite proof.
      for (const node of manifest.nodes) {
        const row = db.get("SELECT data FROM node_data WHERE node = ? AND item_id = ? AND version = ?", [node.node, node.itemId, node.version]) as { data: string } | null
        if (!row || extractionHash(row.data) !== node.hash) throw new Error("Metadata mismatch")
      }
      const extractedImages = db.all("SELECT image_id FROM images WHERE source IN ('page', 'extract')") as Array<{ image_id: string }>
      if (extractedImages.length !== manifest.images.length || extractedImages.some((row) => !imageIds.has(row.image_id))) throw new Error("Image inventory mismatch")
      for (const image of manifest.images) {
        const row = db.get("SELECT image_id, page_id, path, width, height FROM images WHERE image_id = ?", [image.imageId]) as { image_id: string; page_id: string; path: string; width: number; height: number } | null
        if (!row || row.page_id !== image.pageId || row.path !== image.path || row.width !== image.width || row.height !== image.height) throw new Error("Image record mismatch")
      }
    })
  } catch { throw new ExtractionAdmissionError("EXTRACTION_ASSETS_INVALID") }
}

/** Read-only admission after taking the writer gate, before mutable storage. */
export function inspectExtractionDestination(bookDir: string, sourceHash: string, inputs: ExtractionInputs): "initial" | "reused" {
  assertBookWriter(bookDir)
  const manifest = readExtractionManifest(bookDir)
  if (!manifest) {
    assertInitialDestination(bookDir, sourceHash)
    return "initial"
  }
  if (manifest.status !== "complete") throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
  if (manifest.sourceHash !== sourceHash) throw new ExtractionAdmissionError("EXTRACTION_SOURCE_CHANGED")
  if (manifest.inputFingerprint !== extractionHash(JSON.stringify(inputs)) || JSON.stringify(manifest.inputs) !== JSON.stringify(inputs)) throw new ExtractionAdmissionError("EXTRACTION_INPUTS_CHANGED")
  verifyExtractionInventory(bookDir, manifest)
  return "reused"
}

/** Readers may inspect diagnostics, but may not consume a partial page graph. */
export function assertExtractionReadable(bookDir: string): void {
  const manifest = readExtractionManifest(bookDir)
  if (manifest && manifest.status !== "complete") throw new ExtractionAdmissionError("EXTRACTION_INCOMPLETE")
}
