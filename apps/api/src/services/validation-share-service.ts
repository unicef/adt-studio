import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { createBookStorage, openBookDb } from "@adt/storage"
import {
  ValidationShare as ValidationShareSchema,
  ValidationShareFeedback as ValidationShareFeedbackSchema,
  parseBookLabel,
  type ValidationShare,
  type ValidationShareFeedback,
  type SubmitValidationShareFeedback,
} from "@adt/types"

export const VALIDATION_SHARE_NODE = "validation-share"
export const VALIDATION_SHARE_FEEDBACK_NODE = "validation-share-feedback"

export type VersionedValidationShare = { version: number; share: ValidationShare }
export type VersionedValidationShareFeedback = { version: number; feedback: ValidationShareFeedback }

function dbPathFor(label: string, booksDir: string) {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const dbPath = path.join(bookDir, `${safeLabel}.db`)
  if (!fs.existsSync(dbPath)) throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  return { safeLabel, bookDir, dbPath }
}

function latestRows(dbPath: string, node: string) {
  const db = openBookDb(dbPath)
  try {
    return db.all(
      `SELECT current.item_id, current.version, current.data FROM node_data current
       INNER JOIN (SELECT item_id, MAX(version) max_version FROM node_data WHERE node = ? GROUP BY item_id) latest
       ON current.item_id = latest.item_id AND current.version = latest.max_version
       WHERE current.node = ? ORDER BY current.item_id`,
      [node, node],
    ) as Array<{ item_id: string; version: number; data: string }>
  } finally { db.close() }
}

export function hashValidationShareToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function listValidationShares(label: string, booksDir: string): VersionedValidationShare[] {
  const { dbPath } = dbPathFor(label, booksDir)
  return latestRows(dbPath, VALIDATION_SHARE_NODE).map((row) => ({
    version: row.version,
    share: ValidationShareSchema.parse(JSON.parse(row.data)),
  }))
}

export function createValidationShare(label: string, booksDir: string, packageVersion: string, expiresInDays: number) {
  const { safeLabel } = dbPathFor(label, booksDir)
  const token = crypto.randomBytes(32).toString("base64url")
  const now = new Date()
  const share: ValidationShare = {
    share_id: crypto.randomUUID(),
    token_hash: hashValidationShareToken(token),
    package_version: packageVersion,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + expiresInDays * 86_400_000).toISOString(),
  }
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const version = storage.putNodeData(VALIDATION_SHARE_NODE, share.share_id, share)
    return { version, share, token }
  } finally { storage.close() }
}

export function revokeValidationShare(label: string, booksDir: string, shareId: string) {
  const current = listValidationShares(label, booksDir).find((entry) => entry.share.share_id === shareId)
  if (!current) throw new HTTPException(404, { message: "Validation share not found" })
  const { safeLabel } = dbPathFor(label, booksDir)
  const share = { ...current.share, revoked_at: new Date().toISOString() }
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const version = storage.putNodeData(VALIDATION_SHARE_NODE, shareId, share)
    return { version, share }
  } finally { storage.close() }
}

export function publishValidationShareVersion(label: string, booksDir: string, shareId: string, packageVersion: string) {
  const current = listValidationShares(label, booksDir).find((entry) => entry.share.share_id === shareId)
  if (!current) throw new HTTPException(404, { message: "Validation share not found" })
  if (current.share.revoked_at) throw new HTTPException(409, { message: "A revoked validation link cannot be republished" })
  const { safeLabel } = dbPathFor(label, booksDir)
  const share = { ...current.share, package_version: packageVersion }
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const version = storage.putNodeData(VALIDATION_SHARE_NODE, shareId, share)
    return { version, share }
  } finally { storage.close() }
}

export function requireActiveValidationShare(label: string, booksDir: string, token: string) {
  const tokenHash = hashValidationShareToken(token)
  const entry = listValidationShares(label, booksDir).find(({ share }) =>
    crypto.timingSafeEqual(Buffer.from(share.token_hash, "hex"), Buffer.from(tokenHash, "hex")),
  )
  if (!entry || entry.share.revoked_at || Date.parse(entry.share.expires_at) <= Date.now()) {
    throw new HTTPException(404, { message: "This validation link is invalid or no longer active" })
  }
  return entry
}

export function listValidationShareFeedback(label: string, booksDir: string, shareId?: string) {
  const { dbPath } = dbPathFor(label, booksDir)
  return latestRows(dbPath, VALIDATION_SHARE_FEEDBACK_NODE)
    .map((row) => ({ version: row.version, feedback: ValidationShareFeedbackSchema.parse(JSON.parse(row.data)) }))
    .filter((entry) => !shareId || entry.feedback.share_id === shareId) as VersionedValidationShareFeedback[]
}

export function saveValidationShareFeedback(label: string, booksDir: string, shareId: string, input: SubmitValidationShareFeedback) {
  const { safeLabel } = dbPathFor(label, booksDir)
  const feedback: ValidationShareFeedback = ValidationShareFeedbackSchema.parse({
    ...input,
    feedback_id: crypto.randomUUID(),
    share_id: shareId,
    created_at: new Date().toISOString(),
  })
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const version = storage.putNodeData(VALIDATION_SHARE_FEEDBACK_NODE, feedback.feedback_id, feedback)
    return { version, feedback }
  } finally { storage.close() }
}
