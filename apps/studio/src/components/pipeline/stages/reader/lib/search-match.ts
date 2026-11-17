/** Plain-text matching for the inspector search (no i18n, so it is testable on its own). */

/** Lower-case, accents stripped: "Fundo" and "fundo", "Ícone" and "icone" match. */
export function normalizeSearch(value: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Unicode normalization form, not UI copy
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

/** Every word of the query must appear somewhere in the field's text. */
export function matchesSearch(haystack: string, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = normalizeSearch(haystack)
  return words.every((word) => text.includes(word))
}
