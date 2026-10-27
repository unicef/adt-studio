/**
 * A finished step's note is either a summary ("13 headings") or a warning the
 * runner prefixes with "Completed —" ("Completed — 2 page(s) skipped",
 * "Completed — 1 page(s) kept their extracted images unchanged after a
 * failure: …"). Cards surface only the warnings; the popover shows both.
 */
export function isAttentionNote(note: string): boolean {
  return note.startsWith("Completed —")
}
