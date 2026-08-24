import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import {
  parseBookLabel,
  type AdtActivityImportDecision,
  type BookSummary,
} from "@adt/types"

import {
  extractAdtBundleArchiveFiles,
  readAdtBundle,
  type ReadAdtBundle,
} from "./adt-bundle-reader.js"
import { assessAdtImportCompatibility } from "./adt-import-compatibility.js"
import { ADT_IMPORT_IN_PROGRESS_MARKER } from "./adt-import-marker.js"
import { ADT_IMPORT_PROJECTION_VERSION } from "./adt-import-projection.js"
import { seedImportedAdtProject } from "./adt-import-seed/index.js"
import { getBook, listBooks } from "./book-service.js"
import { ensureProjectIdentity } from "./project-identity.js"
import { importedAdtRevisionDir, writeImportedAdtCurrent } from "./imported-adt-source.js"

export class AdtProjectImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdtProjectImportError"
  }
}

function uniqueLabel(baseLabel: string, booksDir: string): string {
  const safeBase = parseBookLabel(baseLabel)
  if (!fs.existsSync(path.join(booksDir, safeBase))) return safeBase
  let suffix = 2
  while (fs.existsSync(path.join(booksDir, `${safeBase}-${suffix}`))) suffix++
  return parseBookLabel(`${safeBase}-${suffix}`)
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporaryPath, filePath)
}

/** Keep the archive this project came from, addressed by its own fingerprint.
 * Every later re-projection reads it rather than the book's generated output. */
function persistImportArchive(
  bookDir: string,
  bundle: ReadAdtBundle,
  zipBuffer: Buffer,
  sourceFileName: string | null,
): { revisionId: string; importedAt: string } {
  const archiveFingerprint = createHash("sha256").update(zipBuffer).digest("hex")
  const publicationId = bundle.manifest.lineage?.publicationId ?? "legacy"
  const revisionId = `${publicationId}-${archiveFingerprint.slice(0, 12)}`
  const revisionDir = importedAdtRevisionDir(bookDir, revisionId)
  const importedAt = new Date().toISOString()

  fs.mkdirSync(revisionDir, { recursive: true })
  fs.writeFileSync(path.join(revisionDir, "source.zip"), zipBuffer)
  writeJsonAtomically(path.join(revisionDir, "import.json"), {
    version: 1,
    revisionId,
    importedAt,
    sourceFileName,
    archiveFingerprint,
    publicationId: bundle.manifest.lineage?.publicationId ?? null,
    lineage: bundle.manifest.lineage ?? null,
  })
  return { revisionId, importedAt }
}

/** Adopt the exporting project's identity when nothing here claims it yet, so a
 * round trip keeps one lineage instead of forking a new project id each time. */
function adoptProjectIdentity(
  bookDir: string,
  bundle: ReadAdtBundle,
  booksDir: string,
): void {
  const existingProjectIds = new Set(listBooks(booksDir).map((book) => book.projectId))
  const originProjectId = bundle.manifest.lineage?.originProjectId
  const canAdoptOrigin = Boolean(originProjectId && !existingProjectIds.has(originProjectId))
  ensureProjectIdentity(bookDir, {
    ...(canAdoptOrigin ? { projectId: originProjectId } : {}),
    sourceKind: "imported-adt",
    sourceFingerprint: bundle.manifest.lineage?.sourceFingerprint ?? null,
    ...(!canAdoptOrigin && originProjectId
      ? { derivedFromProjectId: originProjectId }
      : {}),
  })
}

export function importAdtProject(
  zipBuffer: Buffer,
  booksDir: string,
  options: {
    sourceFileName?: string
    activityDecisions?: readonly AdtActivityImportDecision[]
  } = {},
): BookSummary {
  const resolvedBooksDir = path.resolve(booksDir)
  const bundle = readAdtBundle(zipBuffer)
  const files = extractAdtBundleArchiveFiles(zipBuffer)
  const compatibility = assessAdtImportCompatibility(bundle, files)
  if (!compatibility.supported) {
    const first = compatibility.issues[0]
    throw new AdtProjectImportError(
      `This exported ADT does not follow the supported import structure (${first.pageHref}: ${first.code}).`,
    )
  }

  const label = uniqueLabel(bundle.manifest.book.label, resolvedBooksDir)
  const bookDir = path.join(resolvedBooksDir, label)
  try {
    seedImportedAdtProject(label, resolvedBooksDir, bundle, files, options)
    adoptProjectIdentity(bookDir, bundle, resolvedBooksDir)
    const archive = persistImportArchive(
      bookDir,
      bundle,
      zipBuffer,
      options.sourceFileName ?? null,
    )
    writeImportedAdtCurrent(bookDir, {
      version: 1,
      ...archive,
      projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
    })
    // Last write: until this marker is gone the directory stays hidden from
    // `listBooks`, so an interrupted import never leaves a usable-looking book.
    fs.rmSync(path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER), { force: true })
    return getBook(label, resolvedBooksDir)
  } catch (error) {
    fs.rmSync(bookDir, { recursive: true, force: true })
    throw error
  }
}
