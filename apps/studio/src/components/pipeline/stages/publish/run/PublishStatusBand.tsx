import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PUBLISH_STEP_COPY } from "@/components/pipeline/stages/publish/publish-steps"
import { formatElapsed } from "@/components/settings/publishing/provision-elapsed"
import type { BookPublishRunController } from "@/hooks/use-book-publication"
import type { PublishStall } from "./progress/usePublishStall"
import { CancelControl } from "./CancelControl"
import { PublishAggregateBar } from "./PublishAggregateBar"
import { PublishBigSlot } from "./PublishBigSlot"
import { PublishStepMeter } from "./PublishStepMeter"

/** The clock is noise for the first twenty seconds and the only proof of life after them. */
export const ELAPSED_VISIBLE_AFTER_MS = 20_000

/**
 * Everything the run screen says about *how far*, in one band.
 *
 * This is approach B. It is also, unchanged, the bottom third of approach A — built once and used
 * twice, because the alternative is two step meters, two aggregates and two ideas about which of
 * them is telling the truth. A supplies the *what* by putting the author's own pages above this
 * band; B is the *how far*, and it has to hold up alone at the window heights where there is no
 * room for pages.
 */
export function PublishStatusBand({
  run,
  elapsedMs,
  percent,
  valueText,
  stall,
  onCancel,
  onBackground,
  showStepDetail,
}: {
  run: BookPublishRunController
  elapsedMs: number
  percent: number
  valueText: string
  stall: PublishStall
  onCancel: () => void
  onBackground?: () => void
  showStepDetail: boolean
}) {
  const { i18n } = useLingui()
  const runningIndex = run.stepStates.findIndex((state) => state === "running")
  const step = runningIndex >= 0 ? PUBLISH_STEP_COPY[runningIndex] : null
  const stepTitle = step ? i18n._(step.title) : ""
  const counted = run.progress !== null && run.progress.total > 0
  const clock = <span className="tabular-nums">{formatElapsed(elapsedMs)}</span>

  return (
    <div className="flex min-h-[104px] w-full shrink-0 flex-col gap-2.5">
      <PublishStepMeter states={run.stepStates} />

      <div className="flex flex-col gap-1">
        {/* In counted mode the headline is the number, so the step still has to be named — at the
            size of a caption, above it. In uncounted mode the step title *is* the headline and
            printing it twice would be the loudest thing on the screen said quietly first. */}
        {counted ? (
          <p className="text-sm font-medium text-foreground">{stepTitle}</p>
        ) : null}

        <PublishBigSlot progress={run.progress} stepTitle={stepTitle} />

        {stall !== "moving" ? (
          <p className="text-xs leading-5 text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <Trans>Still working — large books can take a few minutes.</Trans>
          </p>
        ) : showStepDetail && step ? (
          <p className="text-xs leading-5 text-muted-foreground">{i18n._(step.detail)}</p>
        ) : null}
      </div>

      <PublishAggregateBar percent={percent} valueText={valueText} tone="running" />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {/* The expectation is stated once, statically, and never counted down. An ETA over a
            connection that retries individual files is unstable by construction, and an ETA that
            jumps is worse than no ETA at all. */}
        <p className="min-w-0 text-xs text-muted-foreground">
          {elapsedMs >= ELAPSED_VISIBLE_AFTER_MS ? (
            <Trans>{clock} elapsed · usually 1 to 5 minutes</Trans>
          ) : (
            <Trans>usually 1 to 5 minutes</Trans>
          )}
        </p>

        <div className={cn("flex flex-wrap items-center gap-1", stall === "long" && "gap-2")}>
          {onBackground ? (
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onBackground}>
              <Trans>Keep working</Trans>
            </Button>
          ) : null}
          {/* Two minutes of silence does not make the run wrong, so nothing about it changes
              colour or state. What changes is how easy it is to leave. */}
          <CancelControl onCancel={onCancel} emphasis={stall === "long" ? "primary" : "quiet"} />
        </div>
      </div>
    </div>
  )
}
