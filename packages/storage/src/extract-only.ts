import fs from "node:fs"
import path from "node:path"
import type sqlite from "node-sqlite3-wasm"
import { EXTRACT_OWNED_NODES, EXTRACT_RETAINED_CONFIG_NODES, PROJECT_IDENTITY_FILE, ProjectIdentity, STEP_TO_STAGE, type ExtractRerunBlockedReason } from "@adt/types"
import { isBookWriterArtifact } from "./book-writer.js"
import { BOOK_TABLES } from "./db.js"
import { EXTRACTION_MANIFEST_FILE, isInitialRecoveryEvidence, registeredUploadFontFiles } from "./extraction-manifest.js"
import { isConfigRecoveryEvidence, readSectioningLifecycle, SECTIONING_JOURNAL, SECTIONING_LIFECYCLE } from "./sectioning-transition.js"

/** `detail` names the first finding for logs and tests: a file, table, node or
 * step name, never book content. */
export type ExtractOnlyInspection =
  | { extractOnly: true }
  | { extractOnly: false; reason: ExtractRerunBlockedReason; detail: string }

class Finding {
  constructor(readonly reason: ExtractRerunBlockedReason, readonly detail: string) {}
}
function refuse(reason: ExtractRerunBlockedReason, kind: string, name: string): never {
  throw new Finding(reason, `${kind}:${name.replace(/[^\x21-\x7e]/g, "?").slice(0, 80)}`)
}

const ALLOWED_NODES = new Set([...EXTRACT_OWNED_NODES, ...EXTRACT_RETAINED_CONFIG_NODES])
/** `translate` belongs to the Translate stage. AI-generated and manually
 * cropped images are stored as `crop`, and both can be made after Extract alone. */
const ALLOWED_IMAGE_SOURCES = new Set(["page", "extract", "crop", "segment", "upload"])
/** Rows here are diagnostics or the schema marker, kept by every re-run. */
const IGNORED_TABLES = new Set(["schema_version", "llm_log"])
/** Flat folders of regular files that Extract and its configuration own.
 * `templates` holds the book's layout-template overrides, an input like prompts. */
const FILE_DIRECTORIES = new Set(["images", ".debug-images", "styleguides", "templates"])
/** LLM cache and prompt overrides are inputs; initial admission skips them too. */
const INPUT_DIRECTORIES = new Set([".cache", "prompts"])
/** Media of later stages. Created empty with the book; any entry is output. */
const MEDIA_DIRECTORIES = new Set(["videos", "audio"])
/** Names owned by apps/api (packaging, section screenshots, ADT import). They
 * only select the reason: an unlisted name is refused as unrecognized anyway. */
const DOWNSTREAM_ENTRIES = new Set(["adt", "webpub", "epub", "pnld", ".section-renders", ".adt-package-work"])
const IMPORT_ENTRIES = new Set([".adt-import-current.json", ".adt-imports", ".adt-recovery-workspace.json"])
const PARTS_LEDGER = "parts-ledger.json"

function inspectFiles(bookDir: string, db: sqlite.Database): void {
  const label = path.basename(bookDir)
  const plainFiles = new Set([`${label}.pdf`, `${label}.db`, `${label}.db-wal`, `${label}.db-shm`, "config.yaml", "part.json",
    ".book-writer.json", ".DS_Store", EXTRACTION_MANIFEST_FILE, `${EXTRACTION_MANIFEST_FILE}.pending`])
  const emptyDirectories = new Set([`${label}.db.lock`, ".book-writer.json.recovery"])
  for (const entry of fs.readdirSync(bookDir, { withFileTypes: true })) {
    const { name } = entry
    if (entry.isSymbolicLink()) refuse("unrecognized-content", "symlink", name)
    if (isBookWriterArtifact(bookDir, name)) continue
    if (name === PARTS_LEDGER) refuse("split-coordinator", "entry", name)
    if (IMPORT_ENTRIES.has(name)) refuse("not-pdf-source", "entry", name)
    if (DOWNSTREAM_ENTRIES.has(name)) refuse("downstream-output", "entry", name)
    if (entry.isFile()) {
      if (plainFiles.has(name) || isConfigRecoveryEvidence(bookDir, name)) continue
      if (name === SECTIONING_LIFECYCLE) {
        // A preference saved before Sectioning is bookkeeping (not ready, with
        // Storyboard pending by default). Ready means Sectioning completed.
        const lifecycle = readSectioningLifecycle(bookDir)
        if (!lifecycle) refuse("unrecognized-content", "file", name)
        if (lifecycle.sectioningReady) refuse("downstream-output", "file", name)
        continue
      }
      if (name === PROJECT_IDENTITY_FILE) {
        let identity: ProjectIdentity | undefined
        try { identity = ProjectIdentity.parse(JSON.parse(fs.readFileSync(path.join(bookDir, name), "utf8"))) } catch { /* refused below */ }
        if (!identity) refuse("unrecognized-content", "file", name)
        if (identity.sourceKind !== "pdf") refuse("not-pdf-source", "file", name)
        continue
      }
    } else if (entry.isDirectory()) {
      if (INPUT_DIRECTORIES.has(name) || isInitialRecoveryEvidence(bookDir, name, true)) continue
      if (MEDIA_DIRECTORIES.has(name) || emptyDirectories.has(name)) {
        if (fs.readdirSync(path.join(bookDir, name)).length) refuse(MEDIA_DIRECTORIES.has(name) ? "downstream-output" : "unrecognized-content", "directory", name)
        continue
      }
      if (FILE_DIRECTORIES.has(name) || name === "fonts") {
        // Uploaded fonts must be named by a retained registry version, as at
        // initial admission; no folder is a blanket exception for symlinks.
        const registered = name === "fonts" ? registeredUploadFontFiles(db) : undefined
        for (const file of fs.readdirSync(path.join(bookDir, name), { withFileTypes: true })) {
          if (!file.isFile() || registered?.has(file.name) === false) refuse("unrecognized-content", "file", `${name}/${file.name}`)
        }
        continue
      }
    }
    // Includes .sectioning-transition.json: a pending transition must be
    // recovered before anything trusts the book's configuration.
    refuse("unrecognized-content", name === SECTIONING_JOURNAL ? "pending" : "entry", name)
  }
}

function inspectDatabase(db: sqlite.Database): void {
  const names = (sql: string) => (db.all(sql) as Array<{ name: string | null }>).map(row => String(row.name))
  for (const table of names("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
    if (!BOOK_TABLES.includes(table)) refuse("unrecognized-content", "table", table)
    if (IGNORED_TABLES.has(table)) continue
    if (table === "pages") continue
    if (table === "node_data" || table === "node_current") {
      for (const node of names(`SELECT DISTINCT node AS name FROM ${table}`)) {
        if (!ALLOWED_NODES.has(node)) refuse("downstream-output", "node", node)
      }
    } else if (table === "step_runs") {
      for (const step of names("SELECT DISTINCT step AS name FROM step_runs")) {
        if ((STEP_TO_STAGE as Record<string, string | undefined>)[step] !== "extract") refuse("downstream-output", "step", step)
      }
    } else if (table === "images") {
      for (const source of names("SELECT DISTINCT source AS name FROM images")) {
        if (!ALLOWED_IMAGE_SOURCES.has(source)) refuse(source === "translate" ? "downstream-output" : "unrecognized-content", "image-source", source)
      }
    } else if (db.get(`SELECT 1 FROM ${table} LIMIT 1`)) {
      // Sign-language videos and identity history exist only after Sectioning.
      refuse("downstream-output", "table", table)
    }
  }
}

/** SPEC-0003 RAC-20: does this book hold nothing but Extract output and
 * pre-Extract configuration? Read-only and fail-closed: it takes no writer
 * lease, writes nothing, and reports anything unreadable or unrecognized as
 * not Extract-only instead of throwing. `db` is the caller's open connection. */
export function inspectExtractOnly(bookDir: string, db: sqlite.Database): ExtractOnlyInspection {
  try {
    inspectFiles(bookDir, db)
    inspectDatabase(db)
    return { extractOnly: true }
  } catch (error) {
    if (error instanceof Finding) return { extractOnly: false, reason: error.reason, detail: error.detail }
    return { extractOnly: false, reason: "unrecognized-content", detail: `unreadable:${(error as NodeJS.ErrnoException)?.code ?? "error"}` }
  }
}
