import { Trans } from "@lingui/react/macro"
import { AlertTriangle, CalendarOff, Link2, Link2Off, Loader2, Play, TimerReset } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DashLink } from "./dashboard-data"

export function LinkOffPanel({
  link,
  onExtend,
  onShareAgain,
}: {
  link: DashLink
  onExtend: () => void
  onShareAgain: () => void
}) {
  const stopped = link.access === "stopped"
  const offline = !link.workerReachable

  return (
    <div data-testid="sharing-link-off" className="flex min-w-0 flex-col gap-3">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {stopped ? (
          <Link2Off className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <CalendarOff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        {stopped ? <Trans>Sharing is stopped</Trans> : <Trans>The link reached its end date</Trans>}
      </span>
      <p className="text-[13px] leading-5 text-muted-foreground">
        <Trans>Readers can't open the link right now. Everything they left is still here.</Trans>
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {stopped ? (
          <Button
            data-testid="sharing-resume-button"
            className="h-9"
            disabled={link.resuming || offline}
            onClick={() => {
              link.clearFailures()
              link.resume()
            }}
          >
            {link.resuming ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {link.resuming ? <Trans>Resuming…</Trans> : <Trans>Resume sharing</Trans>}
          </Button>
        ) : (
          <Button className="h-9" disabled={offline} onClick={onExtend}>
            <TimerReset aria-hidden="true" />
            <Trans>Extend</Trans>
          </Button>
        )}
        <Button variant="outline" className="h-9" disabled={link.resuming} onClick={onShareAgain}>
          <Link2 aria-hidden="true" />
          <Trans>Share again</Trans>
        </Button>
      </div>

      {link.resumeError !== null ? (
        <div role="alert" data-testid="sharing-resume-error" className="flex flex-col gap-0.5">
          <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <Trans>Sharing couldn't be resumed, so the link is still off.</Trans>
          </p>
          <p className="break-words pl-5 text-[11px] leading-4 text-muted-foreground">{link.resumeError}</p>
        </div>
      ) : null}
    </div>
  )
}
