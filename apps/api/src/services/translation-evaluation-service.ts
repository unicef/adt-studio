import fs from "node:fs"
import path from "node:path"
import {
  TranslationEvaluationResult as TranslationEvaluationResultSchema,
  parseBookLabel,
  type TranslationEvaluationResult,
} from "@adt/types"
import {
  CURRENT_VERSION_ORDER,
  createBookStorage,
  openBookDb,
  readCurrentNodeRow,
} from "@adt/storage"
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

function parseCurrentRows<T>(
  db: BookDb,
  node: string,
  schema: ZodType<T>,
): Array<{ itemId: string; version: number; data: T }> {
  const orderedRows = db.all(
    `SELECT nd.item_id AS item_id, nd.version AS version, nd.data AS data
     FROM node_data nd
     LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
     WHERE nd.node = ?
     ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
    [node],
  ) as Array<{ item_id: string; version: number; data: string }>

  const seen = new Set<string>()
  const rows = orderedRows.filter((row) => {
    if (seen.has(row.item_id)) return false
    seen.add(row.item_id)
    return true
  })

  return rows.map((row) => ({
    itemId: row.item_id,
    version: row.version,
    data: schema.parse(JSON.parse(row.data)),
  }))
}

function getCurrentNodeVersion(
  db: BookDb,
  node: string,
  itemId: string,
): number | null {
  return readCurrentNodeRow(db, node, itemId)?.version ?? null
}

function getCurrentNodeVersions(db: BookDb, node: string): Map<string, number> {
  const rows = db.all(
    `SELECT nd.item_id AS item_id, nd.version AS version
     FROM node_data nd
     LEFT JOIN node_current nc ON nc.node = nd.node AND nc.item_id = nd.item_id
     WHERE nd.node = ?
     ORDER BY nd.item_id, ${CURRENT_VERSION_ORDER}`,
    [node],
  ) as Array<{ item_id: string; version: number }>

  const versions = new Map<string, number>()
  for (const row of rows) {
    if (!versions.has(row.item_id)) versions.set(row.item_id, row.version)
  }
  return versions
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
    const evaluationRows = parseCurrentRows(
      db,
      TRANSLATION_EVALUATION_NODE,
      TranslationEvaluationResultSchema,
    )
    evaluationByLanguage = new Map(evaluationRows.map((row) => [row.itemId, row]))
    translationVersions = getCurrentNodeVersions(db, "text-catalog-translation")
    currentSourceCatalogVersion = getCurrentNodeVersion(db, "text-catalog", "book")
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
    const evaluationRows = parseCurrentRows(
      db,
      TRANSLATION_EVALUATION_NODE,
      TranslationEvaluationResultSchema,
    )
    evaluationRow = evaluationRows.find((row) => row.itemId === language)
    currentTranslationVersion = getCurrentNodeVersion(db, "text-catalog-translation", language)
    currentSourceCatalogVersion = getCurrentNodeVersion(db, "text-catalog", "book")
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
