import { getBaseLanguage, normalizeLocale } from "../../../lib/languages"

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
