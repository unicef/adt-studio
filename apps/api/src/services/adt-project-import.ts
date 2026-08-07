import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { createBookStorage } from "@adt/storage"
import {
  parseBookLabel,
  type AdtActivityImportDecision,
  type BookSummary,
} from "@adt/types"

import { readAdtBundle } from "./adt-bundle-reader.js"
import {
  ADT_IMPORT_PROJECTION_VERSION,
  ADT_RECOVERY_MARKER,
  assessAdtImportCompatibility,
  createAdtRecoverySession,
} from "./adt-recovery-session.js"
import { getBook, listBooks } from "./book-service.js"
import { ensureProjectIdentity } from "./project-identity.js"

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

function persistImportArchive(
  bookDir: string,
  zipBuffer: Buffer,
  sourceFileName: string | null,
): { revisionId: string; importedAt: string } {
  const bundle = readAdtBundle(zipBuffer)
  const archiveFingerprint = createHash("sha256").update(zipBuffer).digest("hex")
  const publicationId = bundle.manifest.lineage?.publicationId ?? "legacy"
  const revisionId = `${publicationId}-${archiveFingerprint.slice(0, 12)}`
  const revisionDir = path.join(bookDir, ".adt-imports", revisionId)
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

function setCurrentImportArchive(
  bookDir: string,
  archive: { revisionId: string; importedAt: string },
): void {
  writeJsonAtomically(path.join(bookDir, ".adt-import-current.json"), {
    version: 1,
    ...archive,
    projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
  })
}

function rewriteImportedBookReferences<T>(
  value: T,
  sourceLabel: string,
  targetLabel: string,
): T {
  const sourcePrefix = `/api/books/${sourceLabel}/images/`
  const targetPrefix = `/api/books/${targetLabel}/images/`
  const serialized = JSON.stringify(value)
  if (!serialized.includes(sourcePrefix)) return value
  return JSON.parse(serialized.replaceAll(sourcePrefix, targetPrefix)) as T
}

function rewritePromotedStoryboardReferences(
  sourceLabel: string,
  targetLabel: string,
  booksDir: string,
): void {
  if (sourceLabel === targetLabel) return
  const storage = createBookStorage(targetLabel, booksDir)
  try {
    for (const page of storage.getPages()) {
      const current = storage.getLatestNodeData("web-rendering", page.pageId)
      if (!current) continue
      const rewritten = rewriteImportedBookReferences(
        current.data,
        sourceLabel,
        targetLabel,
      )
      if (rewritten !== current.data) {
        storage.putNodeData("web-rendering", page.pageId, rewritten)
      }
    }
  } finally {
    storage.close()
  }
}

function promoteTemporaryProject(
  temporaryLabel: string,
  zipBuffer: Buffer,
  booksDir: string,
  sourceFileName: string | null,
): BookSummary {
  const bundle = readAdtBundle(zipBuffer)
  const existingProjectIds = new Set(listBooks(booksDir).map((book) => book.projectId))
  const finalLabel = uniqueLabel(bundle.manifest.book.label, booksDir)
  const temporaryDir = path.join(booksDir, temporaryLabel)
  const finalDir = path.join(booksDir, finalLabel)

  fs.renameSync(temporaryDir, finalDir)
  try {
    fs.renameSync(
      path.join(finalDir, `${temporaryLabel}.db`),
      path.join(finalDir, `${finalLabel}.db`),
    )
    rewritePromotedStoryboardReferences(temporaryLabel, finalLabel, booksDir)
    fs.rmSync(path.join(finalDir, ADT_RECOVERY_MARKER), { force: true })
    fs.rmSync(path.join(finalDir, "source-adt.zip"), { force: true })

    const originProjectId = bundle.manifest.lineage?.originProjectId
    const canAdoptOrigin = Boolean(originProjectId && !existingProjectIds.has(originProjectId))
    ensureProjectIdentity(finalDir, {
      ...(canAdoptOrigin ? { projectId: originProjectId } : {}),
      sourceKind: "imported-adt",
      sourceFingerprint: bundle.manifest.lineage?.sourceFingerprint ?? null,
      ...(!canAdoptOrigin && originProjectId
        ? { derivedFromProjectId: originProjectId }
        : {}),
    })
    const archive = persistImportArchive(finalDir, zipBuffer, sourceFileName)
    setCurrentImportArchive(finalDir, archive)
    // Imported executable files are never served. Preview and export rebuild
    // from the sanitized storyboard projection with ADT Studio's runtime.
    fs.rmSync(path.join(finalDir, "adt"), { recursive: true, force: true })
    return getBook(finalLabel, booksDir)
  } catch (error) {
    fs.rmSync(finalDir, { recursive: true, force: true })
    throw error
  }
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
  const compatibility = assessAdtImportCompatibility(zipBuffer, bundle)
  if (!compatibility.supported) {
    const first = compatibility.issues[0]
    throw new AdtProjectImportError(
      `This exported ADT does not follow the supported import structure (${first.pageHref}: ${first.code}).`,
    )
  }

  const temporary = createAdtRecoverySession(
    zipBuffer,
    resolvedBooksDir,
    options.sourceFileName,
    options.activityDecisions,
  )
  try {
    return promoteTemporaryProject(
      temporary.label,
      zipBuffer,
      resolvedBooksDir,
      options.sourceFileName ?? null,
    )
  } finally {
    fs.rmSync(path.join(resolvedBooksDir, temporary.label), { recursive: true, force: true })
  }
}
