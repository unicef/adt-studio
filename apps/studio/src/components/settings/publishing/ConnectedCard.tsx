import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { CheckCircle2, CircleHelp, Cloud, RefreshCw } from "lucide-react"
import { PublicationsDashboard } from "@/components/publications/PublicationsDashboard"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import type { CloudflareConnectionStatus, CloudflareCredentials } from "@/api/client"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { useDisconnectCloudflare } from "@/hooks/use-cloudflare-connection"
import { DisconnectDialog } from "./DisconnectDialog"
import { ProvisionCalm } from "./ProvisionCalm"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"
import { useElapsed } from "@/lib/elapsed"

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

  const isUpdating = upgrade.status === "running" || upgrade.status === "error"
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card motion-safe:animate-in motion-safe:fade-in-0">
        <div className="flex min-h-0 flex-1 flex-col">
        {isUpdating ? (
          <div
            key="updating"
            className="flex flex-col gap-4 px-5 py-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
          >
            <ProvisionCalm
              status={upgrade.status}
              stepStates={upgrade.stepStates}
              activeStep={upgrade.activeStep}
              elapsedMs={elapsedMs}
              copy={{
                running: t`Updating the sharing service`,
                runningDetail: t`Version ${connection.worker_version ?? "?"} → ${connection.latest_version}. Your shared books stay online while this runs.`,
                done: t`Sharing service updated`,
                doneDetail: t`You're on version ${connection.latest_version}.`,
                error: t`Update stopped`,
                errorDetail: t`Your shared books are still online on the old version. Trying again picks up where it left off.`,
              }}
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
          <div
            key="connected"
            className="flex min-h-0 flex-1 flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
          >
            <div className="flex flex-wrap items-start gap-3 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
                <Cloud className="size-5" style={{ color: "#f6821f" }} aria-hidden="true" />
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    <Trans>Sharing is ready</Trans>
                  </h2>
                  {connection.upgrade_available ? (
                    <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                      <Trans>Update available</Trans>
                    </span>
                  ) : connection.worker_reachable && connection.worker_version_live ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      <Trans>Live</Trans>
                    </span>
                  ) : connection.worker_reachable ? (
                    /** The host answered but did not say what it is running, so the version below
                     *  is remembered rather than reported. A green "Live" here would be a guess
                     *  wearing the clothes of a fact. */
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <CircleHelp className="size-3" aria-hidden="true" />
                      <Trans>Answering, but not confirming</Trans>
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
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
                      connection.worker_version_live ? (
                        <Trans>Version {connection.worker_version}</Trans>
                      ) : (
                        <Trans>Version {connection.worker_version} (last known)</Trans>
                      )
                    ) : (
                      <Trans>Version unknown</Trans>
                    )}
                  </span>
                  {connection.upgrade_available && (
                    <span className="text-brand-700">
                      <Trans>({connection.latest_version} ready to install)</Trans>
                    </span>
                  )}
                </span>
              </div>
            </div>

            <section
              aria-labelledby="hosted-books-heading"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t px-5 py-4"
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2
                    id="hosted-books-heading"
                    className="text-sm font-semibold tracking-tight text-foreground"
                  >
                    <Trans>Hosted books</Trans>
                  </h2>
                  <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
                    <Trans>Usage and sharing controls for books hosted in this Cloudflare account.</Trans>
                  </p>
                </div>
              </div>
              <PublicationsDashboard embedded />
            </section>

            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">
              {connection.upgrade_available && (
                <Button onClick={() => upgrade.start()}>
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
          </div>
        )}
        </div>
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
