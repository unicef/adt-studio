import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCloudflareConnection } from "@/hooks/use-cloudflare-connection"
import { useCloudflareCredentials } from "@/hooks/use-cloudflare-credentials"
import { PublicationsDashboard } from "@/components/publications/PublicationsDashboard"
import { ConnectCloudflareWizard } from "./ConnectCloudflareWizard"
import { ConnectedCard } from "./ConnectedCard"

export function PublishingSettings() {
  const { credentials, hasConnectionHint, markOAuthConnected, clearCredentials } =
    useCloudflareCredentials()
  const connection = useCloudflareConnection(credentials)
  const [hadHintOnMount] = useState(hasConnectionHint)
  const [justProvisioned, setJustProvisioned] = useState(false)
  const isConnected = connection.data?.connected === true
  const isChecking = hadHintOnMount && hasConnectionHint && connection.isPending
  const showConnectedCard = !isChecking && isConnected && !justProvisioned

  return (
    <div className="mx-auto flex w-full flex-col gap-6 p-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          <Trans>Publishing</Trans>
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          <Trans>
            Connect a Cloudflare account once. After that you can share any finished book as a link
            and collect comments on it.
          </Trans>
        </p>
      </header>

      {hasConnectionHint && connection.isError && (
        <div
          data-testid="connection-check-error"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <Trans>We couldn't check your publishing setup</Trans>
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              Your Cloudflare connection is still here. The Studio just couldn't confirm what is set
              up in your account — try again in a moment.
            </Trans>
          </p>
          {connection.error?.message && (
            <p className="text-xs leading-5 text-muted-foreground">{connection.error.message}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void connection.refetch()}
            disabled={connection.isFetching}
          >
            {connection.isFetching && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            <Trans>Try again</Trans>
          </Button>
        </div>
      )}

      {isChecking && (
        <div className="flex items-center gap-2.5 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Trans>Checking your publishing setup…</Trans>
        </div>
      )}

      {showConnectedCard && connection.data && (
        <>
          <ConnectedCard
            connection={connection.data}
            credentials={credentials}
            onDisconnected={() => {
              clearCredentials()
              setJustProvisioned(false)
            }}
          />
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                <Trans>Published books</Trans>
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>Every book you have shared from this Cloudflare account.</Trans>
              </p>
            </div>
            <PublicationsDashboard embedded />
          </section>
        </>
      )}

      {!isChecking && !showConnectedCard && (
        <ConnectCloudflareWizard
          connection={connection.data}
          isConnectionRefreshing={connection.isFetching}
          onOAuthConnected={markOAuthConnected}
          onProvisioned={() => setJustProvisioned(true)}
          onRefreshConnection={() => void connection.refetch()}
          onDisconnected={() => {
            clearCredentials()
            setJustProvisioned(false)
          }}
        />
      )}
    </div>
  )
}
