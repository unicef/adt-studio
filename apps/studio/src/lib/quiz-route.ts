/** Storyboard URL parsing belongs to the UI. Numeric links predate stored
 * quiz IDs and encode the original zero-based array position. */
export function parseQuizRouteId(pageId: string): string | null {
  if (!pageId.startsWith("quiz-")) return null
  const value = pageId.slice(5)
  if (value.startsWith("qz")) {
    const seq = Number(value.slice(2))
    return Number.isSafeInteger(seq) && seq > 0 && value === `qz${String(seq).padStart(3, "0")}`
      ? value : null
  }
  // Strict decimal legacy index; leading zeros remain backward-compatible.
  if (!/^[0-9]+$/.test(value) || value.trim() !== value) return null
  const seq = Number(value) + 1
  return Number.isSafeInteger(seq) && seq > 0 ? `qz${String(seq).padStart(3, "0")}` : null
}
