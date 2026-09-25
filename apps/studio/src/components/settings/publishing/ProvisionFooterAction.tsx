import { Trans } from "@lingui/react/macro"
import { Check, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"

interface ProvisionFooterActionProps {
  status: ProvisionStatus
  onStart: () => void
  onRetry: () => void
  onFinish: () => void
}

/** One fixed-geometry slot holding whatever the moment actually is: an invitation, a
 *  reassurance, or a decision. It never reports progress, which belongs to the rail and the
 *  track, and it never leaves a disabled control sitting on screen for two minutes.
 *
 *  The running copy is load-bearing rather than filler: the provisioning stream is aborted on
 *  unmount, so leaving the step really does end the run, and nothing else on screen says so. */
export function ProvisionFooterAction({
  status,
  onStart,
  onRetry,
  onFinish,
}: ProvisionFooterActionProps) {
  return (
    <span className="ml-auto flex h-11 items-center justify-end">
      {status === "running" ? (
        <span className="flex min-w-52 flex-col items-end justify-center text-right">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-brand-500 motion-safe:animate-medallion-halo"
            />
            <Trans>Nothing needed from you</Trans>
          </span>
          <span className="mt-0.5 text-xs leading-4 text-muted-foreground">
            <Trans>Leave this step open until it finishes.</Trans>
          </span>
        </span>
      ) : status === "done" ? (
        <Button size="lg" className="min-w-52 shadow-sm" onClick={onFinish}>
          <Check className="size-4 shrink-0" aria-hidden="true" />
          <Trans>Finish</Trans>
        </Button>
      ) : status === "error" ? (
        <Button size="lg" className="min-w-52 shadow-sm" onClick={onRetry}>
          <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
          <Trans>Try again</Trans>
        </Button>
      ) : (
        <Button size="lg" className="min-w-52 shadow-sm" onClick={onStart}>
          <Trans>Set up sharing</Trans>
        </Button>
      )}
    </span>
  )
}
