import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { PUBLISH_STEP_COPY } from "@/components/pipeline/stages/publish/publish-steps"
import {
  takeoverDetail,
  takeoverHeading,
} from "@/components/pipeline/stages/publish/takeover-copy"
import { cn } from "@/lib/utils"
import { usePublishAggregate, type PublishAggregate } from "./progress/usePublishAggregate"
import { usePublishAnnouncer } from "./progress/usePublishAnnouncer"
import { usePublishStall } from "./progress/usePublishStall"
import { isAuthorStopped, type PublishRunScreenProps } from "./types"
import { PublishFailureBand } from "./PublishFailureBand"
import { PublishLiveRegion } from "./PublishLiveRegion"
import { PublishShareBlock } from "./PublishShareBlock"
import { PublishStatusBand } from "./PublishStatusBand"
import { formatCount } from "./publish-format"

export interface PublishRunShellProps extends PublishRunScreenProps {
  /* A render prop rather than a node, so the artifact band physically cannot draw itself from a
     second source: the only progress value in scope is the one the bar is already rendering. If
     the artwork and the number could ever disagree, the number wins — and this is how that is made
     true by construction rather than by discipline. */
  /** The step artwork, or nothing at all. Nothing at all is the short-window degradation. */
  artifact?: ((aggregate: PublishAggregate) => ReactNode) | null
  /** Below 720px of card height the running step's detail sentence is the first thing dropped. */
  showStepDetail?: boolean
  compactHeader?: boolean
}

/**
 * The frame of the run screen.
 *
 * Three bands: a header that never moves, an artifact band that is either the author's book or
 * nothing, and a status band. The short-window screen is not a poorer screen than the full one, it
 * is the same screen with the wait unoccupied.
 *
 * The header's second line is load-bearing and permanently slotted. An author publishing an update
 * to a class of children is not anxious about an upload, they are anxious about readers seeing a
 * half-broken book, and *readers stay on version 7 until this finishes* is the entire emotional
 * content of the screen. It is never a tooltip, never a step detail, never something that scrolls
 * away.
 */
export function PublishRunShell({
  artifact = null,
  showStepDetail = false,
  compactHeader = false,
  title,
  fromVersion,
  run,
  elapsedMs,
  onCancel,
  onBackground,
}: PublishRunShellProps) {
  const { i18n, t } = useLingui()
  const aggregate = usePublishAggregate(run)
  const percent = aggregate.percent
  const announcement = usePublishAnnouncer(run, { title })
  const { stall } = usePublishStall(run)

  const copy = { run, title, fromVersion }
  const failed = run.status === "error"
  const done = run.status === "done"
  const stopped = isAuthorStopped(run.status, run.failure)

  const runningIndex = run.stepStates.findIndex((state) => state === "running")
  const step = runningIndex >= 0 ? PUBLISH_STEP_COPY[runningIndex] : null
  const stepTitle = step ? i18n._(step.title) : ""

  /* Never a bare percentage: a screen reader landing on the bar should hear what is happening and
     how far, in that order, because "54" on its own is the least useful true thing we could say. */
  const sent = formatCount(run.progress?.done ?? 0, i18n.locale)
  const outOf = formatCount(run.progress?.total ?? 0, i18n.locale)
  const valueText = done
    ? t`Publishing finished.`
    : failed
      ? t`Publishing stopped before it finished.`
      : run.progress && run.progress.total > 0
        ? t`${stepTitle} — ${sent} of ${outOf}`
        : t`${stepTitle} — still working`

  return (
    <div
      data-publish-run="true"
      data-testid="publish-run-card"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border p-6 transition-colors duration-500 motion-reduce:transition-none",
        failed
          ? "border-destructive/30 bg-destructive/[0.03]"
          : done
            ? "border-emerald-200/70 bg-gradient-to-b from-emerald-50/60 via-card to-card"
            : "border-indigo-200/70 bg-gradient-to-b from-indigo-50/50 via-card to-card",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
      )}
    >
      <PublishLiveRegion {...announcement} />

      <div className="flex min-h-0 w-full flex-1 flex-col justify-center">
        <div
          className={cn(
            "flex min-h-0 w-full flex-col",
            artifact ? "flex-1 gap-4" : "mx-auto max-w-md gap-5",
          )}
        >
          <header
            className={cn(
              "flex w-full shrink-0 flex-col gap-1.5",
              compactHeader ? "min-h-[72px]" : "min-h-[88px]",
            )}
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
              {takeoverHeading(copy)}
              {done ? (
                <Check
                  className="size-5 shrink-0 text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-[240ms]"
                  aria-hidden="true"
                />
              ) : null}
            </h2>
            <p className="max-w-[56ch] text-sm leading-6 text-muted-foreground">
              {takeoverDetail(copy)}
            </p>
          </header>

          {/* The band runs under the card's own padding to its true edges, so a scene that bleeds
              (the Assembly Line's belt) is cut by the page's rounded corner rather than by an
              invisible rectangle floating inside it. Object artworks centre themselves and never
              notice the extra room. */}
          {artifact ? (
            <div className="-mx-6 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {artifact(aggregate)}
            </div>
          ) : null}

          {done ? (
            <PublishShareBlock url={run.result?.url ?? null} showUrl={!artifact} />
          ) : failed ? (
            <PublishFailureBand
              run={run}
              percent={percent}
              valueText={valueText}
              stopped={stopped}
            />
          ) : (
            <PublishStatusBand
              run={run}
              elapsedMs={elapsedMs}
              percent={percent}
              valueText={valueText}
              stall={stall}
              onCancel={onCancel}
              onBackground={onBackground}
              showStepDetail={showStepDetail}
            />
          )}
        </div>
      </div>
    </div>
  )
}
