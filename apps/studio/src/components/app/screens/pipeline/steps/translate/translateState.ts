import type { TextCatalogEntry, TextCatalogResponse } from "@/api/client"
import { getBaseLanguage, normalizeLocale } from "@/lib/languages"
import {
  getEntryCategory,
  isAnswerEntry,
  isEasyReadEntry,
  isImageEntry,
  type CatalogCategory,
} from "@/components/pipeline/stages/languages/lib/catalog-entries"

/**
 * Business rules for the Language step, kept out of the component so they can be
 * tested directly. They mirror the classic pipeline's `LanguageView`:
 *
 * - The book's own language is an output language, listed first and marked as
 *   the base. Selecting it edits the *source* catalog, not a translation.
 * - The language list comes from the book config, not from whichever
 *   translations happen to exist — a configured language with no translation
 *   yet must still be selectable so it can be filled in.
 * - Rows are driven by the source catalog plus the Easy Read entries, which live
 *   in their own node but are translated alongside the catalog. A source entry
 *   with no counterpart in the translation is an untranslated row.
 */

export interface TranslateRow {
  id: string
  source: string
  target: string
  category: CatalogCategory
  isImage: boolean
  isAnswer: boolean
  pageId: string | null
  readOnly: boolean
}

export type TranslateStatus = "all" | "untranslated"

export interface RowFilter {
  category: CatalogCategory
  status: TranslateStatus
  pageId: string | null
  search: string
}

export const NO_FILTER: RowFilter = { category: "all", status: "all", pageId: null, search: "" }

const PAGE_ID_RE = /^(pg\d+)/

function normalizeCode(code: string | null | undefined): string | null {
  const trimmed = code?.trim()
  return trimmed ? normalizeLocale(trimmed) : null
}

/**
 * Output languages in display order: the base language first, then the
 * configured outputs. Languages that only exist as stored translations are
 * appended so an output dropped from the config never hides its work.
 */
export function resolveLanguages({
  configuredOutputs,
  editingLanguage,
  bookLanguage,
  translationCodes,
}: {
  configuredOutputs: string[] | undefined
  editingLanguage: string | undefined
  bookLanguage: string | null | undefined
  translationCodes: string[]
}): { languages: string[]; baseLanguage: string } {
  const base = normalizeCode(editingLanguage) ?? normalizeCode(bookLanguage) ?? "en"
  const seen = new Set<string>([base])
  const languages = [base]
  for (const code of [...(configuredOutputs ?? []), ...translationCodes]) {
    const normalized = normalizeCode(code)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    languages.push(normalized)
  }
  return { languages, baseLanguage: base }
}

export function isBaseLanguage(language: string, baseLanguage: string): boolean {
  if (!language || !baseLanguage) return false
  return getBaseLanguage(language) === getBaseLanguage(baseLanguage)
}

export function pageIdOf(id: string): string | null {
  return PAGE_ID_RE.exec(id)?.[1] ?? null
}

/** Source entries in list order: the catalog, then any Easy Read entry it does not already hold. */
export function sourceEntriesOf(
  catalog: TextCatalogResponse | null | undefined,
  easyRead: readonly TextCatalogEntry[] = [],
): TextCatalogEntry[] {
  const entries = catalog?.entries ?? []
  if (easyRead.length === 0) return entries
  const known = new Set(entries.map((entry) => entry.id))
  const extra = easyRead.filter((entry) => !known.has(entry.id))
  return extra.length > 0 ? [...entries, ...extra] : entries
}

/**
 * One row per source entry, carrying the translation for `language` when there
 * is one. In base-language mode the source text is also the editable text, and
 * Easy Read rows are read-only there: their source belongs to the Easy Read step.
 */
export function buildRows(
  catalog: TextCatalogResponse | null | undefined,
  language: string,
  isBase: boolean,
  easyRead: readonly TextCatalogEntry[] = [],
): TranslateRow[] {
  const sourceEntries = sourceEntriesOf(catalog, easyRead)
  if (sourceEntries.length === 0) return []

  const translated = isBase
    ? null
    : new Map(
        (catalog?.translations[language]?.entries ?? []).map((entry) => [entry.id, entry.text]),
      )

  const rows: TranslateRow[] = []
  for (const entry of sourceEntries) {
    rows.push({
      id: entry.id,
      source: entry.text,
      target: translated ? translated.get(entry.id) ?? "" : entry.text,
      category: getEntryCategory(entry.id),
      isImage: isImageEntry(entry.id),
      isAnswer: isAnswerEntry(entry.id),
      pageId: pageIdOf(entry.id),
      readOnly: isBase && isEasyReadEntry(entry.id),
    })
  }
  return rows
}

export const CATEGORY_KEYS = [
  "text",
  "captions",
  "answers",
  "glossary",
  "easy-read",
] as const

export function isUntranslated(row: TranslateRow): boolean {
  return row.target.trim() === ""
}

export function countByCategory(rows: TranslateRow[]): Map<CatalogCategory, number> {
  const counts = new Map<CatalogCategory, number>()
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  return counts
}

export function countUntranslated(rows: TranslateRow[]): number {
  let total = 0
  for (const row of rows) if (isUntranslated(row)) total += 1
  return total
}

/** How many of the source ids hold a non-empty translation in `entries`. */
export function countTranslated(
  sourceIds: ReadonlySet<string>,
  entries: readonly TextCatalogEntry[] | undefined,
): number {
  let total = 0
  for (const entry of entries ?? []) if (sourceIds.has(entry.id) && entry.text.trim() !== "") total += 1
  return total
}

/** Whether any language other than the base holds at least one translated string. */
export function hasAnyTranslation(
  catalog: TextCatalogResponse | null | undefined,
  baseLanguage: string,
): boolean {
  for (const [code, translation] of Object.entries(catalog?.translations ?? {})) {
    if (isBaseLanguage(normalizeLocale(code), baseLanguage)) continue
    if (translation.entries.some((entry) => entry.text.trim() !== "")) return true
  }
  return false
}

function matchesSearch(row: TranslateRow, needle: string): boolean {
  return (
    row.id.toLowerCase().includes(needle) ||
    row.source.toLowerCase().includes(needle) ||
    row.target.toLowerCase().includes(needle)
  )
}

/**
 * Rows narrowed by every filter. `except` leaves one filter out, which is how
 * each control counts what it would show while the others stay applied.
 */
export function filterRows(
  rows: TranslateRow[],
  filter: RowFilter,
  except?: keyof RowFilter,
): TranslateRow[] {
  const needle = except === "search" ? "" : filter.search.trim().toLowerCase()
  const category = except === "category" ? "all" : filter.category
  const status = except === "status" ? "all" : filter.status
  const pageId = except === "pageId" ? null : filter.pageId
  if (category === "all" && status === "all" && !pageId && !needle) return rows
  const out: TranslateRow[] = []
  for (const row of rows) {
    if (category !== "all" && row.category !== category) continue
    if (status === "untranslated" && !isUntranslated(row)) continue
    if (pageId && row.pageId !== pageId) continue
    if (needle && !matchesSearch(row, needle)) continue
    out.push(row)
  }
  return out
}

/**
 * Entries to persist after editing one row. An entry the translation has never
 * held is appended rather than dropped, which is what makes an untranslated row
 * editable at all.
 */
export function patchEntries(
  entries: TextCatalogEntry[],
  id: string,
  text: string,
): TextCatalogEntry[] {
  let found = false
  const next = entries.map((entry) => {
    if (entry.id !== id) return entry
    found = true
    return { ...entry, text }
  })
  return found ? next : [...next, { id, text }]
}

/** The catalog with one row's text replaced, for the optimistic cache write. */
export function patchCatalog(
  catalog: TextCatalogResponse,
  language: string,
  isBase: boolean,
  id: string,
  text: string,
): TextCatalogResponse {
  if (isBase) return { ...catalog, entries: patchEntries(catalog.entries, id, text) }
  const current = catalog.translations[language]
  return {
    ...catalog,
    translations: {
      ...catalog.translations,
      [language]: { version: current?.version ?? 0, entries: patchEntries(current?.entries ?? [], id, text) },
    },
  }
}

/** The entries a save sends for `language`. */
export function entriesFor(
  catalog: TextCatalogResponse | null | undefined,
  language: string,
  isBase: boolean,
): TextCatalogEntry[] {
  if (!catalog) return []
  return isBase ? catalog.entries : catalog.translations[language]?.entries ?? []
}
