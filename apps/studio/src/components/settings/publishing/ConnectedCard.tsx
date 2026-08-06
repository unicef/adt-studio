import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, CheckCircle2, Cloud, Copy, RefreshCw } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import type { CloudflareConnectionStatus, CloudflareCredentials } from "@/api/client"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { useDisconnectCloudflare } from "@/hooks/use-cloudflare-connection"
import { DisconnectDialog } from "./DisconnectDialog"
import { ExternalLinkButton } from "./ExternalLinkButton"
import { ProvisionCalm } from "./ProvisionCalm"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"
import { useElapsed } from "./provision-elapsed"

interface ConnectedCardProps {
  connection: CloudflareConnectionStatus
  credentials?: Partial<CloudflareCredentials>
  onDisconnected: () => void
}

export function ConnectedCard({ connection, credentials, onDisconnected }: ConnectedCardProps) {
  const { t } = useLingui()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const disconnect = useDisconnectCloudflare()
  const upgrade = useCloudflareProvision(credentials ?? {})
  const elapsedMs = useElapsed(upgrade.status)

  const workerUrl = connection.worker_url
  const isUpdating = upgrade.status === "running" || upgrade.status === "error"

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
      { credentials: credentials ?? {}, deleteResources },
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
        {isUpdating ? (
          <div className="flex flex-col gap-4 px-5 py-6">
            <div className="flex flex-col gap-0.5 text-center">
              <span className="text-base font-semibold tracking-tight text-foreground">
                <Trans>Updating the publishing service</Trans>
              </span>
              <span className="text-xs text-muted-foreground">
                <Trans>
                  Version {connection.worker_version ?? "?"} → {connection.latest_version}. Your
                  published books stay online while this runs.
                </Trans>
              </span>
            </div>

            <ProvisionCalm
              status={upgrade.status}
              stepStates={upgrade.stepStates}
              activeStep={upgrade.activeStep}
              elapsedMs={elapsedMs}
            />

            {upgrade.status === "error" && upgrade.failure && (
              <div className="flex flex-col gap-3">
                <ProvisionErrorNotice failure={upgrade.failure} />
                <Button
                  className="self-center"
                  onClick={() => upgrade.start(upgrade.failure?.resumeStep ?? undefined)}
                >
                  <Trans>Try again</Trans>
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
                <Cloud className="size-5" style={{ color: "#f6821f" }} aria-hidden="true" />
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    <Trans>Publishing is ready</Trans>
                  </h2>
                  {connection.upgrade_available ? (
                    <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      <Trans>Update available</Trans>
                    </span>
                  ) : connection.worker_reachable ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      <Trans>Live</Trans>
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      <Trans>Not answering right now</Trans>
                    </span>
                  )}
                </span>

                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {connection.resources?.account_name ||
                      connection.resources?.account_id || <Trans>Connected</Trans>}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span data-testid={`connection-method-${connection.auth_method ?? "unknown"}`}>
                    {connection.auth_method === "oauth" ? (
                      <Trans>Connected via Cloudflare login</Trans>
                    ) : (
                      <Trans>Connected with API token</Trans>
                    )}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {connection.worker_version ? (
                      <Trans>Version {connection.worker_version}</Trans>
                    ) : (
                      <Trans>Version unknown</Trans>
                    )}
                  </span>
                  {connection.upgrade_available && (
                    <span className="text-indigo-700">
                      <Trans>({connection.latest_version} ready to install)</Trans>
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                <Trans>Your books are published at</Trans>
              </span>
              {workerUrl ? (
                <>
                  <code className="min-w-0 break-all font-mono text-xs text-foreground">
                    {workerUrl}
                  </code>
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyUrl}
                      aria-label={t`Copy address`}
                    >
                      <Copy aria-hidden="true" />
                      <Trans>Copy</Trans>
                    </Button>
                    <ExternalLinkButton href={workerUrl} variant="ghost" size="sm">
                      <Trans>Open</Trans>
                    </ExternalLinkButton>
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  <Trans>Not available yet</Trans>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
              <Button asChild className="group">
                <Link to="/publications">
                  <Trans>Published books</Trans>
                  <ArrowRight
                    className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              {connection.upgrade_available && (
                <Button variant="outline" onClick={() => upgrade.start()}>
                  <RefreshCw aria-hidden="true" />
                  <Trans>Install the update</Trans>
                </Button>
              )}
              <Button
                variant="ghost"
                className="ml-auto text-muted-foreground"
                onClick={() => setDisconnectOpen(true)}
              >
                <Trans>Disconnect</Trans>
              </Button>
            </div>
          </>
        )}
      </div>

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
