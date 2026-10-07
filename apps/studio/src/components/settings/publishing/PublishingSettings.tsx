import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCloudflareConnection } from "@/hooks/use-cloudflare-connection"
import { useCloudflareCredentials } from "@/hooks/use-cloudflare-credentials"
import { ConnectCloudflareWizard } from "./ConnectCloudflareWizard"
import { ConnectedCard } from "./ConnectedCard"
import { SharingSetupSkeleton } from "./SharingSetupSkeleton"

export function PublishingSettings() {
  const { credentials, hasConnectionHint, markOAuthConnected, clearCredentials } = useCloudflareCredentials()
  const connection = useCloudflareConnection(credentials)
  const [hadHintOnMount] = useState(hasConnectionHint)
  const isConnected = connection.data?.connected === true
  const isChecking = hadHintOnMount && hasConnectionHint && connection.isPending

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
      <header>
        <h1 className="mb-1 text-2xl font-bold tracking-[-0.02em] text-foreground"><Trans>Sharing</Trans></h1>
        <p className="max-w-2xl text-[13.5px] leading-6 text-muted-foreground"><Trans>Connect a Cloudflare account to host finished books as private websites.</Trans></p>
      </header>
      {hasConnectionHint && connection.isError && (
        <div data-testid="connection-check-error" className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground"><AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /><Trans>We couldn't check your sharing setup</Trans></span>
          <p className="text-sm leading-6 text-muted-foreground"><Trans>Your Cloudflare connection is still here. Try again in a moment.</Trans></p>
          {connection.error?.message && (
            <p className="text-xs leading-5 text-muted-foreground">{connection.error.message}</p>
          )}
          <Button variant="outline" size="sm" className="self-start" onClick={() => void connection.refetch()} disabled={connection.isFetching}>{connection.isFetching && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}<Trans>Try again</Trans></Button>
        </div>
      )}
      {isChecking && <SharingSetupSkeleton />}
      {isConnected && connection.data ? (
        <ConnectedCard connection={connection.data} credentials={credentials} onDisconnected={clearCredentials} />
      ) : (
        !isChecking && <ConnectCloudflareWizard connection={connection.data} isConnectionRefreshing={connection.isFetching} onOAuthConnected={markOAuthConnected} onProvisioned={() => void connection.refetch()} onRefreshConnection={() => void connection.refetch()} onDisconnected={clearCredentials} />
      )}
    </div>
  )
}
