import { useLingui } from "@lingui/react/macro"
import { getDisplayName, normalizeLocale } from "@/lib/languages"

/**
 * A language's name in the interface language ("inglés" in Spanish, "anglais" in French), so it
 * reads right inside translated sentences. Falls back to the English name list for codes the
 * browser doesn't know. `start` capitalises it for the start of a title or a summary value.
 */
export function languageName(code: string, locale: string, start = false): string {
  let name = ""
  try {
    // "standard": "Portuguese (Brazil)" rather than "Brazilian Portuguese", the same shape for every variety.
    name = new Intl.DisplayNames([locale], { type: "language", languageDisplay: "standard" }).of(normalizeLocale(code)) ?? ""
  } catch {
    name = ""
  }
  if (!name || name.toLowerCase() === code.toLowerCase()) name = getDisplayName(code)
  return start ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : name
}

/** A country's name in the interface language ("Brasil" in Portuguese), from its two-letter code. */
export function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** `languageName` in the current interface language. */
export function useLanguageName() {
  const { i18n } = useLingui()
  return (code: string, start = false) => languageName(code, i18n.locale, start)
}
