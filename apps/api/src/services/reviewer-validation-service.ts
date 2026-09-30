import fs from "node:fs"
import path from "node:path"
import {
  ReviewerPageValidationRecord as ReviewerPageValidationRecordSchema,
  ReviewerValidationSession as ReviewerValidationSessionSchema,
  parseBookLabel,
  type ReviewerPageValidationRecord,
  type ReviewerValidationSession,
} from "@adt/types"
import { createBookStorage, openBookDb } from "@adt/storage"
import { HTTPException } from "hono/http-exception"
import { z, type ZodType } from "zod"

export const REVIEWER_VALIDATION_SESSION_NODE = "reviewer-validation-session"
export const REVIEWER_PAGE_VALIDATION_NODE = "reviewer-page-validation"

export interface VersionedReviewerValidationSession {
  version: number
  session: ReviewerValidationSession
}

export interface VersionedReviewerPageValidationRecord {
  version: number
  record: ReviewerPageValidationRecord
}

export interface ReviewerPageValidationFilters {
  sessionId: string
  pageId?: string
  language?: string
}

function getDbPath(label: string, booksDir: string): { safeLabel: string; dbPath: string } {
  const safeLabel = parseBookLabel(label)
  const dbPath = path.join(path.resolve(booksDir), safeLabel, `${safeLabel}.db`)
  return { safeLabel, dbPath }
}

function ensureBookExists(dbPath: string, safeLabel: string) {
  if (!fs.existsSync(dbPath)) {
    throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
  }
}

function parseLatestRows<T>(
  dbPath: string,
  node: string,
  schema: ZodType<T>,
): Array<{ itemId: string; version: number; data: T }> {
  const db = openBookDb(dbPath)
  try {
    const rows = db.all(
      `SELECT current.item_id as item_id, current.version as version, current.data as data
       FROM node_data current
       INNER JOIN (
         SELECT item_id, MAX(version) as max_version
         FROM node_data
         WHERE node = ?
         GROUP BY item_id
       ) latest
       ON current.item_id = latest.item_id AND current.version = latest.max_version
       WHERE current.node = ?
       ORDER BY current.item_id ASC`,
      [node, node],
    ) as Array<{ item_id: string; version: number; data: string }>

    return rows.map((row) => ({
      itemId: row.item_id,
      version: row.version,
      data: schema.parse(JSON.parse(row.data)),
    }))
  } finally {
    db.close()
  }
}

function buildReviewerPageValidationItemId(record: ReviewerPageValidationRecord): string {
  return [record.session_id, record.page_id, record.language ?? "default"].join(":")
}

export function listReviewerValidationSessions(label: string, booksDir: string): VersionedReviewerValidationSession[] {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  return parseLatestRows(dbPath, REVIEWER_VALIDATION_SESSION_NODE, ReviewerValidationSessionSchema).map((row) => ({
    version: row.version,
    session: row.data as ReviewerValidationSession,
  }))
}

export function saveReviewerValidationSession(
  label: string,
  booksDir: string,
  session: ReviewerValidationSession,
): VersionedReviewerValidationSession {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  const storage = createBookStorage(safeLabel, booksDir)
  try {
    return storage.transaction(() => {
      const parsed = ReviewerValidationSessionSchema.parse(session)
      const previous = storage.getLatestNodeData(REVIEWER_VALIDATION_SESSION_NODE, parsed.session_id)
      // Ownership belongs to the original session, including legacy sessions
      // that never had a snapshot. A stale writer cannot replace that meaning.
      if (previous) {
        const original = ReviewerValidationSessionSchema.parse(previous.data)
        parsed.catalog_snapshot = original.catalog_snapshot
      }
      const version = storage.putNodeData(REVIEWER_VALIDATION_SESSION_NODE, parsed.session_id, parsed)
      return { version, session: parsed as ReviewerValidationSession }
    })
  } finally {
    storage.close()
  }
}

export function listReviewerPageValidationRecords(
  label: string,
  booksDir: string,
  filters: ReviewerPageValidationFilters,
): VersionedReviewerPageValidationRecord[] {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  return parseLatestRows(dbPath, REVIEWER_PAGE_VALIDATION_NODE, ReviewerPageValidationRecordSchema)
    .map((row) => ({ version: row.version, record: row.data as ReviewerPageValidationRecord }))
    .filter(({ record }) => record.session_id === filters.sessionId)
    .filter(({ record }) => (filters.pageId ? record.page_id === filters.pageId : true))
    .filter(({ record }) => (filters.language ? record.language === filters.language : true))
    .sort((left, right) => {
      const leftPage = left.record.page_number ?? Number.MAX_SAFE_INTEGER
      const rightPage = right.record.page_number ?? Number.MAX_SAFE_INTEGER
      if (leftPage !== rightPage) {
        return leftPage - rightPage
      }
      return left.record.page_id.localeCompare(right.record.page_id)
    })
}

export function saveReviewerPageValidationRecord(
  label: string,
  booksDir: string,
  record: ReviewerPageValidationRecord,
): VersionedReviewerPageValidationRecord {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const parsed = ReviewerPageValidationRecordSchema.parse(record)
    const version = storage.putNodeData(REVIEWER_PAGE_VALIDATION_NODE, buildReviewerPageValidationItemId(parsed), parsed)
    return { version, record: parsed as ReviewerPageValidationRecord }
  } finally {
    storage.close()
  }
}

export const ReviewerValidationListQuery = z.object({
  sessionId: z.string().min(1),
  pageId: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
})
export type ReviewerValidationListQuery = z.infer<typeof ReviewerValidationListQuery>
