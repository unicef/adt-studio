import { Check, Loader2, RotateCcw, TriangleAlert, WandSparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { NoticeStrip } from "@/components/ui/notice-strip"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HeaderButtonTile } from "../../shared/headerButton"
import { ProblemNotice } from "../../shared/problems/ProblemNotice"
import type { TranslationReview } from "./useTranslationReview"

export function ReviewButton({ review, dirtyReason }: { review: TranslationReview; dirtyReason?: string | null }) {
  const { t } = useLingui()
  if (!review.enabled) return null
  const { counts } = review
  const icon = review.reviewing ? Loader2 : review.hasResults && counts.needsAttention === 0 ? Check : WandSparkles
  const label = review.reviewing
    ? t`Reviewing…`
    : review.hasResults && counts.needsAttention > 0
      ? t`${plural(counts.needsAttention, { one: "# issue", other: "# issues" })}`
      : review.hasResults
        ? t`Reviewed`
        : t`Review`
  const disabled = !review.canReview || !!dirtyReason
  return (
    <button
      type="button"
      onClick={review.run}
      disabled={disabled}
      title={dirtyReason ?? (review.hasResults ? t`Review the translations shown again` : t`Ask AI to review the translations shown`)}
      className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, review.reviewing && "[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none")}
    >
      <HeaderButtonTile icon={icon} />
      {label}
    </button>
  )
}

export function ReviewNotices({ review, hex }: { review: TranslationReview; hex: string }) {
  const { t } = useLingui()
  if (!review.enabled) return null
  const again = { label: <Trans>Review again</Trans>, icon: RotateCcw, onClick: review.run, disabled: !review.canReview }
  return (
    <>
      {review.task && (
        <NoticeStrip
          tone="attention"
          hex={hex}
          icon={WandSparkles}
          role="status"
          title={<Trans>Reviewing translations</Trans>}
          body={
            review.task.progressMessage ??
            (typeof review.task.progressPercent === "number"
              ? t`${Math.round(review.task.progressPercent)}% done`
              : t`AI is checking the translations shown.`)
          }
        />
      )}
      {!review.task && review.isStale && (
        <ProblemNotice
          level="partial"
          hex={hex}
          icon={TriangleAlert}
          title={<Trans>The last review is out of date</Trans>}
          body={<Trans>The text changed since it ran. Review again to check the translations shown.</Trans>}
          action={again}
        />
      )}
      {!review.task && review.failed && (
        <ProblemNotice
          level="partial"
          hex={hex}
          icon={TriangleAlert}
          title={<Trans>The last review didn't finish</Trans>}
          body={<Trans>Its results can't be trusted. Review again to check the translations shown.</Trans>}
          action={again}
        />
      )}
      {review.error && (
        <ProblemNotice level="blocked" icon={TriangleAlert} title={<Trans>The review couldn't run</Trans>} body={review.error.message} />
      )}
    </>
  )
}
