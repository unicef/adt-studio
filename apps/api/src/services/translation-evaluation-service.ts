import fs from "node:fs"
import path from "node:path"
import {
  TranslationEvaluationResult as TranslationEvaluationResultSchema,
  parseBookLabel,
  type TranslationEvaluationResult,
} from "@adt/types"
import { createBookStorage, openBookDb } from "@adt/storage"
import { HTTPException } from "hono/http-exception"
import { type ZodType } from "zod"

export const TRANSLATION_EVALUATION_NODE = "translation-evaluation"

export interface VersionedTranslationEvaluationResult {
  version: number
  evaluation: TranslationEvaluationResult
}

export interface TranslationEvaluationStatus {
  language: string
  currentSourceCatalogVersion: number | null
  currentTranslationVersion: number | null
  evaluationVersion: number | null
  evaluation: TranslationEvaluationResult | null
  isStale: boolean
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

type BookDb = ReturnType<typeof openBookDb>

function parseLatestRows<T>(
  db: BookDb,
  node: string,
  schema: ZodType<T>,
): Array<{ itemId: string; version: number; data: T }> {
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
}

function getLatestNodeVersion(
  db: BookDb,
  node: string,
  itemId: string,
): number | null {
  const rows = db.all(
    "SELECT version FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
    [node, itemId],
  ) as Array<{ version: number }>
  return rows[0]?.version ?? null
}

function getLatestNodeVersions(db: BookDb, node: string): Map<string, number> {
  const rows = db.all(
    `SELECT current.item_id as item_id, current.version as version
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
  ) as Array<{ item_id: string; version: number }>

  return new Map(rows.map((row) => [row.item_id, row.version]))
}

function buildEvaluationStatus(
  language: string,
  currentSourceCatalogVersion: number | null,
  currentTranslationVersion: number | null,
  evaluationRow?: { version: number; data: TranslationEvaluationResult },
): TranslationEvaluationStatus {
  const evaluation = evaluationRow?.data ?? null
  const evaluationVersion = evaluationRow?.version ?? null
  const isStale = evaluation !== null && (
    currentSourceCatalogVersion === null ||
    currentTranslationVersion === null ||
    evaluation.source_catalog_version !== currentSourceCatalogVersion ||
    evaluation.translation_version !== currentTranslationVersion
  )

  return {
    language,
    currentSourceCatalogVersion,
    currentTranslationVersion,
    evaluationVersion,
    evaluation,
    isStale,
  }
}

export function listTranslationEvaluationStatuses(
  label: string,
  booksDir: string,
): TranslationEvaluationStatus[] {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  const db = openBookDb(dbPath)
  let evaluationByLanguage: Map<string, { itemId: string; version: number; data: TranslationEvaluationResult }>
  let translationVersions: Map<string, number>
  let currentSourceCatalogVersion: number | null
  try {
    const evaluationRows = parseLatestRows(
      db,
      TRANSLATION_EVALUATION_NODE,
      TranslationEvaluationResultSchema,
    )
    evaluationByLanguage = new Map(evaluationRows.map((row) => [row.itemId, row]))
    translationVersions = getLatestNodeVersions(db, "text-catalog-translation")
    currentSourceCatalogVersion = getLatestNodeVersion(db, "text-catalog", "book")
  } finally {
    db.close()
  }
  const languages = new Set<string>([
    ...translationVersions.keys(),
    ...evaluationByLanguage.keys(),
  ])

  return [...languages]
    .sort((left, right) => left.localeCompare(right))
    .map((language) => buildEvaluationStatus(
      language,
      currentSourceCatalogVersion,
      translationVersions.get(language) ?? null,
      evaluationByLanguage.get(language),
    ))
}

export function getTranslationEvaluationStatus(
  label: string,
  booksDir: string,
  language: string,
): TranslationEvaluationStatus | null {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  const db = openBookDb(dbPath)
  let evaluationRow: { itemId: string; version: number; data: TranslationEvaluationResult } | undefined
  let currentTranslationVersion: number | null
  let currentSourceCatalogVersion: number | null
  try {
    const evaluationRows = parseLatestRows(
      db,
      TRANSLATION_EVALUATION_NODE,
      TranslationEvaluationResultSchema,
    )
    evaluationRow = evaluationRows.find((row) => row.itemId === language)
    currentTranslationVersion = getLatestNodeVersion(db, "text-catalog-translation", language)
    currentSourceCatalogVersion = getLatestNodeVersion(db, "text-catalog", "book")
  } finally {
    db.close()
  }

  if (!evaluationRow && currentTranslationVersion === null) {
    return null
  }

  return buildEvaluationStatus(
    language,
    currentSourceCatalogVersion,
    currentTranslationVersion,
    evaluationRow,
  )
}

export function saveTranslationEvaluationResult(
  label: string,
  booksDir: string,
  evaluation: TranslationEvaluationResult,
): VersionedTranslationEvaluationResult {
  const { safeLabel, dbPath } = getDbPath(label, booksDir)
  ensureBookExists(dbPath, safeLabel)

  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const parsed = TranslationEvaluationResultSchema.parse(evaluation)
    const version = storage.putNodeData(TRANSLATION_EVALUATION_NODE, parsed.language, parsed)
    return { version, evaluation: parsed }
  } finally {
    storage.close()
  }
}
