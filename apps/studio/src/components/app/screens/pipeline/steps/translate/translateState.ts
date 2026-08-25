import type { TextCatalogEntry, TextCatalogResponse } from "@/api/client"
import { getBaseLanguage, normalizeLocale } from "@/lib/languages"
import {
  getEntryCategory,
  isAnswerEntry,
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
 * - Rows are driven by the source catalog. A source entry with no counterpart
 *   in the translation is an untranslated row, not a missing one.
 */

export interface TranslateRow {
  id: string
  source: string
  target: string
  category: CatalogCategory
  isImage: boolean
  isAnswer: boolean
}

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

/**
 * One row per source entry, carrying the translation for `language` when there
 * is one. In base-language mode the source text is also the editable text.
 */
export function buildRows(
  catalog: TextCatalogResponse | null | undefined,
  language: string,
  isBase: boolean,
): TranslateRow[] {
  const sourceEntries = catalog?.entries ?? []
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

export function countByCategory(rows: TranslateRow[]): Map<CatalogCategory, number> {
  const counts = new Map<CatalogCategory, number>()
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  return counts
}

export function countUntranslated(rows: TranslateRow[]): number {
  let total = 0
  for (const row of rows) if (row.target.trim() === "") total += 1
  return total
}

export function filterRows(
  rows: TranslateRow[],
  category: CatalogCategory,
  search: string,
): TranslateRow[] {
  const needle = search.trim().toLowerCase()
  if (category === "all" && !needle) return rows
  const out: TranslateRow[] = []
  for (const row of rows) {
    if (category !== "all" && row.category !== category) continue
    if (
      needle &&
      !row.id.toLowerCase().includes(needle) &&
      !row.source.toLowerCase().includes(needle) &&
      !row.target.toLowerCase().includes(needle)
    ) {
      continue
    }
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
