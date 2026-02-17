/**
 * Normalize locale code to dash format.
 * "en_US" -> "en-US", "pt-br" -> "pt-BR", "en" -> "en"
 * If the input is not a valid locale code, returns the trimmed input unchanged.
 */
export function normalizeLocale(code: string): string {
  const trimmed = code.trim()
  if (!trimmed) return ""
  const candidate = trimmed.replace(/_/g, "-")
  try {
    const locale = new Intl.Locale(candidate)
    if (!locale.language) return candidate
    if (locale.region) return `${locale.language.toLowerCase()}-${locale.region.toUpperCase()}`
    return locale.language.toLowerCase()
  } catch {
    return candidate
  }
}

/**
 * Extract the base language from a locale code.
 * "en-US" -> "en", "pt-BR" -> "pt", "en" -> "en"
 */
export function getBaseLanguage(code: string): string {
  const normalized = normalizeLocale(code)
  return normalized.split("-")[0].toLowerCase()
}

export interface LanguageContext {
  language_code: string
  language: string
}

export interface TranslationLanguageContext {
  source_language_code: string
  source_language: string
  target_language_code: string
  target_language: string
}

function getLanguageDisplayName(code: string): string {
  const normalized = normalizeLocale(code)
  if (!normalized) return ""
  let locale: Intl.Locale
  try {
    locale = new Intl.Locale(normalized)
  } catch {
    return normalized
  }
  if (!locale.language) return normalized

  const languageNames = new Intl.DisplayNames(["en"], { type: "language" })
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" })

  const languageName = languageNames.of(locale.language) ?? locale.language
  if (!locale.region) return languageName

  const regionName = regionNames.of(locale.region) ?? locale.region
  return `${languageName} (${regionName})`
}

export function buildLanguageContext(languageCode: string): LanguageContext {
  const normalized = normalizeLocale(languageCode)
  return {
    language_code: normalized || languageCode,
    language: getLanguageDisplayName(normalized || languageCode),
  }
}

export function buildTranslationLanguageContext(
  sourceLanguageCode: string,
  targetLanguageCode: string
): TranslationLanguageContext {
  const source = buildLanguageContext(sourceLanguageCode)
  const target = buildLanguageContext(targetLanguageCode)
  return {
    source_language_code: source.language_code,
    source_language: source.language,
    target_language_code: target.language_code,
    target_language: target.language,
  }
}
