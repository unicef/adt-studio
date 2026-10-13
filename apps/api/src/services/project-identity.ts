import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import {
  PROJECT_IDENTITY_VERSION,
  ProjectIdentity,
  type ProjectSourceKind,
} from "@adt/types"

export const PROJECT_IDENTITY_FILE = ".adt-project.json"

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
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx" })
    return identity
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const raced = readProjectIdentity(bookDir)
      if (raced) return raced
    }
    throw error
  }
}
