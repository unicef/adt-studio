/**
 * A finished step's stored message is one of three things: a warning the
 * runner prefixes with "Completed —" ("Completed — 2 page(s) skipped",
 * "Completed — 1 page(s) kept their extracted images unchanged after a
 * failure: …"), a summary ("13 headings", "313 terms from 94 pages"), or the
 * last progress counter ("12/12") that a step without a note leaves behind.
 * Cards and pills surface only the warnings; the popover shows warnings and
 * summaries and drops bare counters.
 */
export function isAttentionNote(note: string): boolean {
  return note.startsWith("Completed —")
}

export function isProgressCounter(note: string): boolean {
  return /^\s*\d+\s*\/\s*\d+\s*$/.test(note)
}

/** The note worth showing for a finished step, or undefined. */
export function displayableNote(note: string | undefined): string | undefined {
  if (!note) return undefined
  const trimmed = note.trim()
  return trimmed.length === 0 || isProgressCounter(trimmed) ? undefined : trimmed
}
