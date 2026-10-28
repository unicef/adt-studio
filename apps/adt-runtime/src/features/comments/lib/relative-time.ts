import type { CommentsTranslate } from "@/features/comments/hooks/useCommentsText"

const MINUTE = 60_000

const HOUR = 60 * MINUTE

const DAY = 24 * HOUR

/**
 * Coarse relative time. Anything older than a week reads as a plain date, which
 * the browser localises for us — the catalog only has to carry the four short
 * recent-past forms.
 */
export function relativeTime(iso: string, t: CommentsTranslate, now = Date.now()): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return ""

  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE) return t("comments-just-now-label")
  if (elapsed < HOUR) {
    return t("comments-minutes-ago-label", { count: String(Math.floor(elapsed / MINUTE)) })
  }
  if (elapsed < DAY) {
    return t("comments-hours-ago-label", { count: String(Math.floor(elapsed / HOUR)) })
  }
  if (elapsed < 7 * DAY) {
    return t("comments-days-ago-label", { count: String(Math.floor(elapsed / DAY)) })
  }
  return new Date(timestamp).toLocaleDateString()
}
