import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import type { CloudflareConnectionStatus, CloudflareCredentials } from "@/api/client"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { useDisconnectCloudflare } from "@/hooks/use-cloudflare-connection"
import { DisconnectDialog } from "./DisconnectDialog"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { ProvisionChecklist } from "./ProvisionChecklist"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"

interface ConnectedCardProps {
  connection: CloudflareConnectionStatus
  credentials: Partial<CloudflareCredentials>
  onDisconnected: () => void
}

function DetailRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <span className="text-sm text-muted-foreground sm:w-44 sm:shrink-0">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-foreground">
        {children}
      </div>
    </div>
  )
}

export function ConnectedCard({ connection, credentials, onDisconnected }: ConnectedCardProps) {
  const { t } = useLingui()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const disconnect = useDisconnectCloudflare()
  const upgrade = useCloudflareProvision(credentials)

  const workerUrl = connection.worker_url

  async function copyUrl() {
    if (!workerUrl) return
    try {
      await navigator.clipboard.writeText(workerUrl)
      toast.success(t`Address copied.`)
    } catch {
      toast.error(t`Couldn't copy the address.`)
    }
  }

  function confirmDisconnect(deleteResources: boolean) {
    disconnect.mutate(
      { credentials, deleteResources },
      {
        onSuccess: (result) => {
          setDisconnectOpen(false)
          onDisconnected()
          toast.success(
            result.deleted_resources
              ? t`Disconnected. Everything was deleted from your Cloudflare account.`
              : t`Disconnected from Cloudflare.`,
          )
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            <Trans>Publishing is ready</Trans>
          </h2>
          {connection.upgrade_available && (
            <Badge variant="secondary" className="ml-auto">
              <Trans>Update available</Trans>
            </Badge>
          )}
        </div>

        <DetailRow label={<Trans>Your books are published at</Trans>}>
          {workerUrl ? (
            <>
              <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {workerUrl}
              </code>
              <Button variant="ghost" size="sm" onClick={copyUrl} aria-label={t`Copy address`}>
                <Copy aria-hidden="true" />
                <Trans>Copy</Trans>
              </Button>
              <ExternalLinkButton href={workerUrl} variant="ghost">
                <Trans>Open</Trans>
              </ExternalLinkButton>
            </>
          ) : (
            <span className="text-muted-foreground">
              <Trans>Not available yet</Trans>
            </span>
          )}
        </DetailRow>

        <DetailRow label={<Trans>Cloudflare account</Trans>}>
          <span>
            {connection.resources?.account_name ||
              connection.resources?.account_id || <Trans>Connected</Trans>}
          </span>
        </DetailRow>

        <DetailRow label={<Trans>How you connected</Trans>}>
          <span data-testid={`connection-method-${connection.auth_method ?? "unknown"}`}>
            {connection.auth_method === "oauth" ? (
              <Trans>Connected via Cloudflare login</Trans>
            ) : (
              <Trans>Connected with API token</Trans>
            )}
          </span>
        </DetailRow>

        <DetailRow label={<Trans>Publishing service</Trans>}>
          <span>
            {connection.worker_version ? (
              <Trans>Version {connection.worker_version}</Trans>
            ) : (
              <Trans>Version unknown</Trans>
            )}
          </span>
          {connection.upgrade_available && (
            <span className="text-muted-foreground">
              <Trans>A newer version ({connection.latest_version}) is ready to install.</Trans>
            </span>
          )}
          {!connection.worker_reachable && (
            <span className="text-amber-600">
              <Trans>Not answering right now</Trans>
            </span>
          )}
        </DetailRow>

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <Button asChild variant="outline" className="group">
            <Link to="/publications">
              <Trans>Published books</Trans>
              <ArrowRight
                className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          </Button>
          {connection.upgrade_available && upgrade.status !== "running" && (
            <Button onClick={() => upgrade.start()}>
              <RefreshCw aria-hidden="true" />
              <Trans>Install the update</Trans>
            </Button>
          )}
          {upgrade.status === "running" && (
            <Button disabled>
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <Trans>Updating…</Trans>
            </Button>
          )}
          {upgrade.status === "error" && (
            <Button
              variant="outline"
              onClick={() => upgrade.start(upgrade.failure?.resumeStep ?? undefined)}
            >
              <Trans>Try again</Trans>
            </Button>
          )}
          <Button
            variant="outline"
            className="ml-auto"
            onClick={() => setDisconnectOpen(true)}
            disabled={upgrade.status === "running"}
          >
            <Trans>Disconnect</Trans>
          </Button>
        </div>
      </div>

      {upgrade.status !== "idle" && (
        <div className="rounded-xl border bg-card p-4">
          <ProvisionChecklist
            status={upgrade.status}
            stepStates={upgrade.stepStates}
            activeStep={upgrade.activeStep}
          />
          {upgrade.status === "error" && upgrade.failure && (
            <div className="mt-3">
              <ProvisionErrorNotice failure={upgrade.failure} />
            </div>
          )}
        </div>
      )}

      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={(next) => {
          setDisconnectOpen(next)
          if (!next) disconnect.reset()
        }}
        onConfirm={confirmDisconnect}
        isPending={disconnect.isPending}
        errorMessage={disconnect.error?.message ?? null}
      />
    </div>
  )
}
