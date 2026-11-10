import { Trans, useLingui } from "@lingui/react/macro"
import { SkipForward, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import { reasonLabel } from "../ReasonChip"
import { ROW_BUTTON } from "../ReviewRow"
import type { ReviewSession } from "../step/useReviewSession"
import type { ReviewStep } from "../ranking"
import { ClearJudgements, CopyResultsButton } from "./JudgeActions"
import { JudgeDots } from "./JudgeDots"
import { aiTextOf, type JudgingApi } from "./useJudging"
import { VerdictButtons } from "./VerdictButtons"

export function JudgePanel({
  label,
  step,
  list,
  session,
  judge,
}: {
  label: string
  step: ReviewStep
  list: readonly ReviewStep[]
  session: ReviewSession
  judge: JudgingApi
}) {
  const { t, i18n } = useLingui()
  const item = step.lead
  const verdict = judge.stepVerdict(step)
  const reason = reasonLabel((descriptor) => i18n._(descriptor), item.reason)
  const explain = item.reason.explain ? i18n._(item.reason.explain) : null
  const ai = aiTextOf(item.reason)
  const size = item.width && item.height ? `${item.width} × ${item.height}` : null
  const position = session.index + 1
  const judgedSteps = list.filter((entry) => judge.stepVerdict(entry) !== null).length

  return (
    <div className="flex flex-col gap-2.5 border-t border-[color-mix(in_srgb,var(--chrome-hex)_18%,transparent)] pt-2.5 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none" data-judge-panel>
      <div className="flex items-start gap-3">
        <FilteredThumb
          key={step.key}
          label={label}
          imageId={item.imageId}
          alt={t`Page ${item.pageNumber}, image ${item.number}`}
          className="size-[76px] bg-card animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <VerdictButtons verdict={verdict} onPick={(value) => judge.setVerdict(step, value)} />
            <p key={item.key} className="min-w-0 flex-1 text-[12px] leading-snug animate-in fade-in duration-200 motion-reduce:animate-none" data-judge-reason>
              <span className="font-semibold text-foreground">{reason}</span>
              {size && <span className="font-mono text-[11px] text-muted-foreground tabular-nums"> · {size}</span>}
              {explain && !ai && <span className="text-muted-foreground"> · {explain}</span>}
            </p>
          </div>
          {ai && (
            <p key={`${item.key}-ai`} className="flex min-w-0 items-start gap-1.5 rounded-md bg-amber-500/8 px-2 py-1.5 text-[12px] leading-snug text-foreground/85 animate-in fade-in duration-200 motion-reduce:animate-none dark:bg-amber-400/10" data-judge-ai>
              <Sparkles className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
              <span className="line-clamp-3 min-w-0" title={ai}>
                <span className="font-semibold text-amber-800 dark:text-amber-300">
                  <Trans>AI:</Trans>
                </span>{" "}
                {ai}
              </span>
            </p>
          )}
          <textarea
            key={`${item.key}-comment`}
            value={judge.commentOf(item.imageId)}
            onChange={(event) => judge.setComment(step, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                event.currentTarget.blur()
              }
            }}
            rows={1}
            placeholder={t`Add a comment (optional) · Esc to leave the box`}
            aria-label={t`Comment on page ${item.pageNumber}, image ${item.number}`}
            data-judge-comment
            className={cn(
              "max-h-40 min-h-8 w-full resize-none rounded-lg border bg-card px-2.5 py-1.5 text-[12.5px] leading-snug [field-sizing:content] placeholder:text-muted-foreground/70",
              "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
              "outline-none focus-visible:border-[color-mix(in_srgb,var(--chrome-hex)_55%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_25%,transparent)]",
            )}
          />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <JudgeDots list={list} index={session.index} verdictOf={judge.verdictOf} commentOf={judge.commentOf} onJump={session.goTo} />
        <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground tabular-nums" data-judge-counter>
          <Trans>
            {position} of {session.total} · {judgedSteps} judged
          </Trans>
        </span>
        <button
          type="button"
          onClick={() => session.goTo(judge.nextUnjudged)}
          disabled={judge.nextUnjudged < 0}
          className={cn(ROW_BUTTON, "h-8")}
          data-judge-next-unjudged
        >
          <SkipForward className="size-3" aria-hidden />
          {judge.nextUnjudged < 0 ? <Trans>All judged</Trans> : <Trans>Next unjudged</Trans>}
        </button>
        <ClearJudgements judge={judge} />
        <CopyResultsButton judge={judge} />
      </div>
    </div>
  )
}
