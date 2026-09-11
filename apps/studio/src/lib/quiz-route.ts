/** Storyboard URL parsing belongs to the UI. Numeric links predate stored
 * quiz IDs and encode the original zero-based array position. */
export function parseQuizRouteId(pageId: string): string | null {
  const match = /^quiz-(qz(?!000)\d{3}|\d+)$/.exec(pageId)
  if (!match) return null
  if (match[1].startsWith("qz")) return match[1]
  const index = Number(match[1])
  return Number.isInteger(index) && index >= 0 && index < 999
    ? `qz${String(index + 1).padStart(3, "0")}`
    : null
}
