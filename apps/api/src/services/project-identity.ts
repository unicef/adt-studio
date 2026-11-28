import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { withBookWriter } from "@adt/storage"

import {
  PROJECT_IDENTITY_FILE,
  PROJECT_IDENTITY_VERSION,
  ProjectIdentity,
  type ProjectSourceKind,
} from "@adt/types"

export { PROJECT_IDENTITY_FILE } from "@adt/types"

export class ProjectIdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProjectIdentityError"
  }
}

function identityPath(bookDir: string): string {
  return path.join(bookDir, PROJECT_IDENTITY_FILE)
}

function fingerprintFile(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

export function readProjectIdentity(bookDir: string): ProjectIdentity | null {
  const filePath = identityPath(bookDir)
  if (!fs.existsSync(filePath)) return null
  try {
    return ProjectIdentity.parse(JSON.parse(fs.readFileSync(filePath, "utf8")))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ProjectIdentityError(`Invalid project identity: ${reason}`)
  }
}

export function ensureProjectIdentity(
  bookDir: string,
  options: {
    projectId?: string
    sourceKind?: ProjectSourceKind
    sourceFingerprint?: string | null
    derivedFromProjectId?: string
  } = {},
): ProjectIdentity {
  const existing = readProjectIdentity(bookDir)
  if (existing) return existing
  if (!fs.existsSync(bookDir)) {
    throw new ProjectIdentityError("Cannot create identity for a missing project directory")
  }

  const pdfPath = fs.readdirSync(bookDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort()[0]
  const sourceKind = options.sourceKind ?? (pdfPath ? "pdf" : "unknown")
  const identity = ProjectIdentity.parse({
    version: PROJECT_IDENTITY_VERSION,
    projectId: options.projectId ?? randomUUID(),
    sourceKind,
    sourceFingerprint: options.sourceFingerprint !== undefined
      ? options.sourceFingerprint
      : pdfPath
        ? fingerprintFile(path.join(bookDir, pdfPath))
        : null,
    createdAt: new Date().toISOString(),
    ...(options.derivedFromProjectId
      ? { derivedFromProjectId: options.derivedFromProjectId }
      : {}),
  })

  const filePath = identityPath(bookDir)
  // Written whole to a temporary file, then linked into place: a crash can't
  // leave a truncated identity, and linking fails if another writer won.
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    const contents = `${JSON.stringify(identity, null, 2)}\n`
    fs.writeFileSync(temporaryPath, contents, { flag: "wx" })
    try {
      fs.linkSync(temporaryPath, filePath)
    } catch (linkError) {
      // exFAT/FAT32 drives and many network shares have no hard links: write
      // in place, still refusing to replace an identity another writer saved.
      const code = (linkError as NodeJS.ErrnoException).code
      if (code !== "EPERM" && code !== "ENOTSUP" && code !== "ENOSYS" && code !== "EXDEV" && code !== "EOPNOTSUPP") throw linkError
      fs.writeFileSync(filePath, contents, { flag: "wx" })
    }
    return identity
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const raced = readProjectIdentity(bookDir)
      if (raced) return raced
    }
    throw error
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

/** A stable stand-in project id for a book whose identity can't be read or
 * written, so it can still be listed. Never saved. */
function unsavedProjectId(bookDir: string): string {
  const hex = createHash("sha256").update(`adt-unsaved-identity:${path.resolve(bookDir)}`).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/**
 * The identity to show for a book in the library. One book with an unreadable
 * identity (a truncated file, a read-only folder) must not break the whole
 * listing: it is listed with an unsaved stand-in identity instead, and the
 * problem is logged.
 */
export function projectIdentityForListing(bookDir: string): ProjectIdentity {
  try {
    // Reading an existing identity is cheap and needs no write admission. A
    // legacy book's first Library read must not write into a busy/copying source.
    return readProjectIdentity(bookDir) ?? withBookWriter(bookDir, () => ensureProjectIdentity(bookDir))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[books] ${path.basename(bookDir)}: project identity unavailable (${reason}); listed without one`)
    let hasPdf = false
    try {
      hasPdf = fs.readdirSync(bookDir).some((name) => name.toLowerCase().endsWith(".pdf"))
    } catch {
      // An unreadable folder is listed as an unknown source.
    }
    return ProjectIdentity.parse({
      version: PROJECT_IDENTITY_VERSION,
      projectId: unsavedProjectId(bookDir),
      sourceKind: hasPdf ? "pdf" : "unknown",
      sourceFingerprint: null,
      createdAt: new Date(0).toISOString(),
    })
  }
}
