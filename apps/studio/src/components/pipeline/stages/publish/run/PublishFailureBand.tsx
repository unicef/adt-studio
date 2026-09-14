import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { PublishErrorNotice } from "@/components/pipeline/stages/publish/PublishErrorNotice"
import type { BookPublishRunController } from "@/hooks/use-book-publication"
import { PublishAggregateBar } from "./PublishAggregateBar"
import { PublishStepMeter } from "./PublishStepMeter"

/**
 * The end of a run that did not finish, drawn in the place the run was already being watched.
 *
 * A failure subtracts nothing. The completed segments stay completed, the bar stays exactly where
 * it stopped — it does not empty and it does not helpfully fill to 100% — and above this band the
 * page grid keeps its fill. That history is the evidence the author did nothing wrong, and a
 * generic error card that throws away three minutes of visible progress is asking them to assume
 * the opposite.
 *
 * A Cloudflare 5xx that reaches this screen has already survived per-file retry server-side, so
 * the honest primary action is to try the whole thing again, not to send anybody to Settings.
 */
export function PublishFailureBand({
  run,
  percent,
  valueText,
  stopped,
}: {
  run: BookPublishRunController
  percent: number
  valueText: string
  /** The author pressed Stop. Same frozen drawing, different sentence and a different verb. */
  stopped: boolean
}) {
  const first = run.kind === "publish"

  return (
    /* Everything here is fixed except the explanation. A short window plus a long error message is
       the one combination that will not fit, and the honest thing to shrink is the prose — a
       progress display that has to be scrolled to find out what happened has failed twice. */
    <div className="flex min-h-0 w-full flex-col gap-3">
      <div className="shrink-0">
        <PublishStepMeter states={run.stepStates} />
      </div>
      <div className="shrink-0">
        <PublishAggregateBar percent={percent} valueText={valueText} tone="failed" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {stopped ? (
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              You stopped this before it finished. Nothing was sent, and publishing again starts a
              fresh copy — it does not resume this one.
            </Trans>
          </p>
        ) : run.failure ? (
          <PublishErrorNotice failure={run.failure} />
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* `retry`, not `publish`: a first publish carries the access code and end date the author
            chose, and re-running the wrong kind would either lose them or fail. */}
        <Button type="button" onClick={run.retry}>
          {stopped ? <Trans>Publish again</Trans> : <Trans>Try again</Trans>}
        </Button>
        {/* Without this the author is held on a screen about a run that is over. Only on a first
            publish, where the way out is the form they filled in; an update has no form. */}
        {first ? (
          <Button type="button" variant="ghost" onClick={run.reset}>
            <Trans>Change how you share</Trans>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
