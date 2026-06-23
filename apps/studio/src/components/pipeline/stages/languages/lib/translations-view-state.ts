import { getBaseLanguage, normalizeLocale } from "../../../../../lib/languages"

interface ResolveTranslationLanguageStateInput {
  selectedLang: string | null
  configuredEditingLanguage: string | undefined
  bookLanguage: string | null
  isBookLoading: boolean
}

interface ResolveTranslationLanguageStateResult {
  editingLanguage: string
  editingLangCode: string | null
  isSourceLang: boolean
  isSourceLanguagePending: boolean
}

function normalizeCode(code: string | null | undefined): string | null {
  if (!code) return null
  const trimmed = code.trim()
  if (!trimmed) return null
  return normalizeLocale(trimmed)
}

/**
 * The book's original/source language is always an output language. Returns the
 * output list with the source ensured first and a stale bare-base seed updated
 * to the live localized source ("es" -> "es-UY"), while preserving deliberately
 * added regional variants ("en-GB" while the source is "en", or "es-MX" while
 * the source is "es-UY"). Used to keep the Language step in sync with the
 * Extract metadata language without clobbering user-chosen outputs.
 */
export function reconcileSourceOutputLanguage(
  existing: string[],
  sourceLanguage: string,
): string[] {
  const source = normalizeLocale(sourceLanguage)
  const baseCode = getBaseLanguage(source)
  const sourceIsRegional = source !== baseCode
  const kept = existing
    .map((code) => normalizeLocale(code))
    .filter(
      (code) =>
        // Dedupe the exact source (re-added first below)...
        code !== source &&
        // ...and drop the bare-base seed only when the source is now regional.
        !(sourceIsRegional && code === baseCode),
    )
  return [source, ...kept]
}

export function resolveTranslationLanguageState({
  selectedLang,
  configuredEditingLanguage,
  bookLanguage,
  isBookLoading,
}: ResolveTranslationLanguageStateInput): ResolveTranslationLanguageStateResult {
  const normalizedConfigured = normalizeCode(configuredEditingLanguage)
  const normalizedBook = normalizeCode(bookLanguage)
  const editingLangCode = normalizedConfigured ?? normalizedBook
  const editingLanguage = editingLangCode ?? "en"
  const isSourceLanguagePending = !normalizedConfigured && isBookLoading
  const isSourceLang = !isSourceLanguagePending
    && selectedLang != null
    && editingLangCode != null
    && getBaseLanguage(selectedLang) === getBaseLanguage(editingLangCode)

  return {
    editingLanguage,
    editingLangCode,
    isSourceLang,
    isSourceLanguagePending,
  }
}
