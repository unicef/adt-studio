import { useLingui } from "@lingui/react/macro"
import { relativeAge } from "./lib/threads"

/** Coarse relative time, matching what reviewers see in the published reader. Anything older
 *  than a week reads as a plain localized date, so the catalog carries only four recent forms. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const { t, i18n } = useLingui()
  const age = relativeAge(iso)
  if (!age) return null

  const label =
    age.unit === "now"
      ? t`just now`
      : age.unit === "minutes"
        ? t`${age.value}m ago`
        : age.unit === "hours"
          ? t`${age.value}h ago`
          : age.unit === "days"
            ? t`${age.value}d ago`
            : new Date(age.value).toLocaleDateString(i18n.locale)

  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  )
}
