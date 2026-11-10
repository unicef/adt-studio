import type { GlossaryRow } from "../glossaryRows"

export interface TextSegment {
  text: string
  key: string | null
}

const BOUNDARY_BEFORE = /(?<![\p{L}\p{M}])/u.source
const BOUNDARY_AFTER = /(?![\p{L}\p{M}])/u.source

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function termPattern(rows: readonly GlossaryRow[]): { re: RegExp; keyOf: Map<string, string> } | null {
  const keyOf = new Map<string, string>()
  for (const row of rows) {
    for (const variant of [row.word, ...row.variations]) {
      const lower = variant.trim().toLocaleLowerCase()
      if (lower && !keyOf.has(lower)) keyOf.set(lower, row._key)
    }
  }
  if (keyOf.size === 0) return null
  const variants = [...keyOf.keys()].sort((a, b) => b.length - a.length)
  try {
    return { re: new RegExp(`${BOUNDARY_BEFORE}(${variants.map(escapeRegExp).join("|")})${BOUNDARY_AFTER}`, "giu"), keyOf }
  } catch {
    return null
  }
}

export function splitByTerms(text: string, rows: readonly GlossaryRow[]): TextSegment[] {
  const pattern = termPattern(rows)
  if (!pattern || !text) return [{ text, key: null }]
  const segments: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(pattern.re)) {
    const start = match.index ?? 0
    if (start > last) segments.push({ text: text.slice(last, start), key: null })
    segments.push({ text: match[0], key: pattern.keyOf.get(match[0].toLocaleLowerCase()) ?? null })
    last = start + match[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), key: null })
  return segments
}
