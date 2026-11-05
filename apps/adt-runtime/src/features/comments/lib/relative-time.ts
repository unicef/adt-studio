import type { CommentsTranslate } from "@/features/comments/hooks/useCommentsText"

const MINUTE = 60_000

const HOUR = 60 * MINUTE

const DAY = 24 * HOUR

/**
 * Coarse relative time: "just now", then the browser's own words — "5 minutes ago",
 * "3 hours ago", "yesterday" — in the book's language, then a plain date after a week.
 *
 * The catalog used to carry the recent-past forms as abbreviations ("29 h ago", "1 d ago"),
 * which read like a log file and could not say "yesterday". `Intl.RelativeTimeFormat` says it
 * properly in every locale the runtime ships, so only "just now" — which it has no word for —
 * stays in the catalog, along with the old forms as a fallback for a browser without it.
 */
export function relativeTime(
  iso: string,
  t: CommentsTranslate,
  now = Date.now(),
  locale?: string,
): string {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return ""

  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE) return t("comments-just-now-label")
  if (elapsed >= 7 * DAY) return new Date(timestamp).toLocaleDateString(locale)

  const [value, unit, key] =
    elapsed < HOUR
      ? ([Math.floor(elapsed / MINUTE), "minute", "comments-minutes-ago-label"] as const)
      : elapsed < DAY
        ? ([Math.floor(elapsed / HOUR), "hour", "comments-hours-ago-label"] as const)
        : ([Math.floor(elapsed / DAY), "day", "comments-days-ago-label"] as const)

  if (typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function") {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-value, unit)
    } catch {
      /* an unknown locale tag falls through to the catalog */
    }
  }
  return t(key, { count: String(value) })
}
