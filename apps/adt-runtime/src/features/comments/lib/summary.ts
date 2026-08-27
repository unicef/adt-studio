/**
 * Shortening a comment for the surfaces that only have room for a glance — the
 * hover preview and the sidebar list. Trimming happens on a word boundary and
 * newlines collapse to spaces, so a two-line preview of a comment written as a
 * list does not read as one word per line.
 */

const ELLIPSIS = "…"

export function snippet(body: string, maxChars = 120): string {
  const flat = body.replace(/\s+/g, " ").trim()
  if (flat.length <= maxChars) return flat
  const cut = flat.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ELLIPSIS}`
}
