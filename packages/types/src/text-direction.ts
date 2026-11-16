/**
 * Writing direction of a book language.
 *
 * A static table rather than `Intl.Locale#getTextInfo()`: packaging (Node),
 * Studio and every reader browser must agree on a book's direction, and that
 * API is absent from some of them.
 */
export type TextDirection = "ltr" | "rtl"

/** Languages whose usual script is written right to left. */
const RTL_LANGUAGES = new Set([
  "ar", // Arabic
  "bal", // Balochi
  "ckb", // Central Kurdish (Sorani)
  "dv", // Dhivehi
  "fa", // Persian
  "he", // Hebrew
  "ks", // Kashmiri
  "ps", // Pashto
  "sd", // Sindhi
  "skr", // Saraiki
  "ug", // Uyghur
  "ur", // Urdu
  "yi", // Yiddish
])

/**
 * Locales that are right-to-left in one region only. Punjabi is written in
 * Gurmukhi (left to right) in India and in Shahmukhi (right to left) in
 * Pakistan.
 */
const RTL_LOCALES = new Set(["pa-pk"])

/** Accepts any casing and either separator: `ur`, `ur-PK`, `ur_pk`. */
export function getTextDirection(languageCode: string | null | undefined): TextDirection {
  const locale = (languageCode ?? "").trim().replace(/_/g, "-").toLowerCase()
  if (RTL_LOCALES.has(locale)) return "rtl"
  return RTL_LANGUAGES.has(locale.split("-")[0]) ? "rtl" : "ltr"
}
