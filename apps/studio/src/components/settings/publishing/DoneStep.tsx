import { Trans } from "@lingui/react/macro"
import { Loader2, PartyPopper, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareConnectionStatus, CloudflareCredentials } from "@/api/client"
import { ConnectedCard } from "./ConnectedCard"

interface DoneStepProps {
  connection: CloudflareConnectionStatus | undefined
  credentials: CloudflareCredentials
  isRefreshing: boolean
  onRefresh: () => void
  onDisconnected: () => void
}

export function DoneStep({
  connection,
  credentials,
  isRefreshing,
  onRefresh,
  onDisconnected,
}: DoneStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300">
        <PartyPopper className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">
            <Trans>Publishing is set up</Trans>
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              You only had to do that once. To share a book, open it and go to its Export step —
              you'll find Publish there.
            </Trans>
          </p>
        </div>
      </div>

      {connection?.connected ? (
        <ConnectedCard
          connection={connection}
          credentials={credentials}
          onDisconnected={onDisconnected}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>Fetching the details of your new setup.</Trans>
          </p>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            <Trans>Refresh</Trans>
          </Button>
        </div>
      )}
    </div>
  )
}
