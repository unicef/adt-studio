import { Trans, Plural } from "@lingui/react/macro"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { useHostUpdates } from "@/hooks/use-host-updates"

/**
 * Says how many shared books still run an older reader, and updates them all.
 *
 * The book host is redeployed on every share and update, so a link keeps whatever reader it was
 * last shared with until someone presses "Update site" — and nothing said so. One line above the
 * shelf, and one button: the same link and the same comments come out the other side, so there
 * is nothing to decide per book.
 */
export function HostUpdatesBanner({
  labels,
  updates,
}: {
  labels: string[]
  updates: ReturnType<typeof useHostUpdates>
}) {
  const waiting = labels.filter((label) => updates.stateOf(label) !== "updating" && updates.stateOf(label) !== "queued")
  /** The cards no longer carry their own update state, so a failure has to be said here. */
  const failed = labels.filter((label) => updates.stateOf(label) === "failed").length
  if (labels.length === 0 && !updates.running) return null

  return (
    <div
      data-testid="host-updates-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-brand-500/25 bg-brand-500/[0.06] px-4 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300"
    >
      <Sparkles className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {updates.running ? (
            <Trans>
              Updating shared books — {updates.progress.done + 1} of {updates.progress.total}
            </Trans>
          ) : (
            <Plural
              value={labels.length}
              one="# shared book runs an older reader"
              other="# shared books run an older reader"
            />
          )}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {failed > 0 && !updates.running ? (
            <span className="text-destructive">
              <Plural
                value={failed}
                one="The last update didn't finish for # book — trying again is safe."
                other="The last update didn't finish for # books — trying again is safe."
              />
            </span>
          ) : (
            <Trans>
              Updating gives readers the latest reader and code screen. Each keeps its link and its
              comments.
            </Trans>
          )}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-card"
        disabled={updates.running || waiting.length === 0}
        onClick={() => updates.update(waiting)}
      >
        {updates.running ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {updates.running ? <Trans>Updating…</Trans> : waiting.length > 1 ? <Trans>Update all</Trans> : <Trans>Update</Trans>}
      </Button>
    </div>
  )
}
