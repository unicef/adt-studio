import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { CircleAlert } from "lucide-react"
import type { AdtBundleImportPreview } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  activityReviewKind,
  failsOnlyChecks,
  pageName,
  useActivityReasonLabel,
  useControlsLabel,
} from "@/components/import/ActivityClassificationDialog/activity-labels"
import { CopyTextButton } from "./CopyTextButton"

type ReviewItem = AdtBundleImportPreview["activityReview"]["items"][number]

/** Pages listed by name before the rest fold into "+N more". */
const SHOWN_PAGES = 2

/**
 * Activity pages that need a type, or whose type is accepted but fail the
 * accessibility checks for it (#1155). Follows the
 * Polaris warning banner: a toned title that names the action, a body that
 * says what blocks import and how to fix it, one item per page, one primary
 * action. It can't be dismissed: import waits on it.
 */
export function ActivityBanner({
  items,
  unresolvedCount,
  activityPrompt,
  onChooseTypes,
}: {
  items: ReviewItem[]
  unresolvedCount: number
  activityPrompt: string | null
  onChooseTypes: () => void
}) {
  const { t } = useLingui()
  const controlsLabel = useControlsLabel()
  const reasonLabel = useActivityReasonLabel()
  const kind = activityReviewKind(items)
  const pending = items.filter((item) => item.status === "needs-review")
  const shown = pending.slice(0, SHOWN_PAGES)
  const more = pending.length - shown.length

  return (
    <section
      aria-label={kind === "checks" ? t`Activity pages to confirm` : t`Activity pages to review`}
      className="shrink-0 overflow-hidden rounded-xl border border-amber-500/35 bg-card"
    >
      <div className="flex items-center gap-2 bg-amber-500/10 px-3.5 py-2.5 text-amber-700 dark:text-amber-400">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        <h3 className="text-[13.5px] font-semibold text-foreground">
          {kind === "checks"
            ? <Plural value={unresolvedCount} one="Confirm # activity page" other="Confirm # activity pages" />
            : kind === "mixed"
              ? <Plural value={unresolvedCount} one="Review # activity page" other="Review # activity pages" />
              : <Plural value={unresolvedCount} one="Choose a type for # activity page" other="Choose a type for # activity pages" />}
        </h3>
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-3 text-[12.5px]">
        <p className="text-muted-foreground">
          {kind === "checks"
            ? <Trans>Their activity type is accepted, but they fail accessibility checks for it. Import can’t start until you confirm each page: keep its type, or choose another.</Trans>
            : kind === "mixed"
              ? <Trans>Some pages need an activity type, and others fail accessibility checks for theirs. Import can’t start until each page is reviewed.</Trans>
              : <Trans>Import can’t start until each page has a type. Pick them yourself, or give the instructions to your AI assistant.</Trans>}
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-foreground marker:text-muted-foreground">
          {shown.map((item) => {
            const name = pageName(item)
            if (failsOnlyChecks(item)) {
              const problems = item.validationErrors.length
              return (
                <li key={item.sectionId}>
                  <Trans><span className="font-semibold">{name}</span>: <Plural value={problems} one="# accessibility problem found" other="# accessibility problems found" /></Trans>
                </li>
              )
            }
            // Without controls, "has interactive controls" was untrue: say why it was flagged.
            if (!item.controls?.length) {
              const reason = reasonLabel(item.reasons[0])
              return (
                <li key={item.sectionId}>
                  <Trans><span className="font-semibold">{name}</span>: {reason}</Trans>
                </li>
              )
            }
            const controls = controlsLabel(item.controls)
            return (
              <li key={item.sectionId}>
                <Trans><span className="font-semibold">{name}</span> has {controls}</Trans>
              </li>
            )
          })}
          {more > 0 ? (
            <li className="list-none font-medium text-brand-600 dark:text-brand-400">
              <Trans>+{more} more</Trans>
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button type="button" size="sm" onClick={onChooseTypes} className="h-8 text-xs">
            {kind === "checks" ? <Trans>Confirm pages</Trans> : kind === "mixed" ? <Trans>Review pages</Trans> : <Trans>Choose types</Trans>}
          </Button>
          {activityPrompt ? (
            <CopyTextButton value={activityPrompt}><Trans>Copy AI instructions</Trans></CopyTextButton>
          ) : null}
        </div>
      </div>
    </section>
  )
}
