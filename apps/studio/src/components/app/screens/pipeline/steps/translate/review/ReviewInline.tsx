import { memo, useState } from "react"
import { Check, ChevronDown, Loader2, TriangleAlert, WandSparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { QUIET_CHIP } from "../../shared/ui"
import type { ReviewItem } from "./reviewState"

const ACTION = cn(
  "inline-flex h-7 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-[12px] font-semibold text-foreground",
  "transition-[background-color,border-color] duration-150 hover:bg-muted motion-reduce:transition-none",
  "disabled:pointer-events-none disabled:opacity-45",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

function useIssueLabels() {
  const { t } = useLingui()
  return {
    issue: (issue: string) =>
      issue === "meaning"
        ? t`Meaning`
        : issue === "fluency"
          ? t`Fluency`
          : issue === "terminology"
            ? t`Terminology`
            : issue === "omission-or-addition"
              ? t`Omission or addition`
              : issue === "formatting"
                ? t`Formatting`
                : issue === "context"
                  ? t`Context`
                  : t`Other`,
    severity: (severity: string) => (severity === "low" ? t`Low` : severity === "high" ? t`High` : t`Medium`),
  }
}

export const ReviewInline = memo(function ReviewInline({
  item,
  hex,
  applied,
  accepting,
  locked,
  onApply,
  onAcceptAnyway,
}: {
  item: ReviewItem
  hex: string
  applied: boolean
  accepting: boolean
  locked: boolean
  onApply: (text: string) => void
  onAcceptAnyway: () => void
}) {
  const { t } = useLingui()
  const labels = useIssueLabels()
  const [open, setOpen] = useState(false)

  if (item.acceptable || item.accepted_anyway) {
    return (
      <div className="flex flex-col gap-1.5 px-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(QUIET_CHIP, "w-fit gap-1 transition-colors hover:bg-muted hover:text-foreground")}
          title={t`Show the review's reasoning`}
        >
          <Check aria-hidden className="size-3" style={{ color: hex }} strokeWidth={3} />
          {item.acceptable ? <Trans>Reviewed</Trans> : <Trans>Accepted anyway</Trans>}
          <ChevronDown aria-hidden className={cn("size-3 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
        {open && (
          <p className="text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
            {item.rationale}
          </p>
        )}
      </div>
    )
  }

  if (applied) {
    return (
      <p className="flex items-center gap-1.5 px-1.5 text-[11.5px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
        <Check aria-hidden className="size-3" style={{ color: hex }} strokeWidth={3} />
        <Trans>Suggestion applied and saved. Review again to check it.</Trans>
      </p>
    )
  }

  return (
    <div
      role="group"
      aria-label={t`Review of this translation`}
      className="flex flex-col gap-2 rounded-lg border px-2.5 py-2 text-[12px] animate-in fade-in duration-200 motion-reduce:animate-none"
      style={{ borderColor: tint(hex, 0.35), background: tint(hex, 0.05) }}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" style={{ color: hex }} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold text-foreground">
            <Trans>Needs attention</Trans>
          </span>
          <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">{item.rationale}</p>
          {((item.issue_types?.length ?? 0) > 0 || item.severity) && (
            <div className="flex flex-wrap gap-1">
              {item.issue_types?.map((issue) => (
                <span key={issue} className={QUIET_CHIP}>
                  {labels.issue(issue)}
                </span>
              ))}
              {item.severity && <span className={QUIET_CHIP}>{t`Severity: ${labels.severity(item.severity)}`}</span>}
            </div>
          )}
        </div>
      </div>

      {item.suggested_text ? (
        <div className="flex flex-col gap-1 rounded-md border bg-card px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <WandSparkles aria-hidden className="size-3" style={{ color: hex }} />
            <Trans>Suggested translation</Trans>
            {item.suggestion_validated && <span className={QUIET_CHIP}>{t`Checked`}</span>}
          </span>
          <p className="leading-relaxed whitespace-pre-wrap text-foreground">{item.suggested_text}</p>
        </div>
      ) : item.suggestion_validated === false ? (
        <p className="leading-relaxed text-muted-foreground">
          {item.suggestion_validation_rationale ?? t`No suggestion is shown because the proposed fix didn't pass its check.`}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {item.suggested_text && (
          <button type="button" className={ACTION} disabled={locked} onClick={() => onApply(item.suggested_text!)}>
            <Check aria-hidden className="size-3" />
            <Trans>Use suggestion</Trans>
          </button>
        )}
        <button type="button" className={ACTION} disabled={locked || accepting} onClick={onAcceptAnyway}>
          {accepting ? <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden className="size-3" />}
          <Trans>Keep as is</Trans>
        </button>
      </div>
    </div>
  )
})
