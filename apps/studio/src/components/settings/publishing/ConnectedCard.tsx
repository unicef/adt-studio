import { useLayoutEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, CheckCircle2, Cloud, RefreshCw } from "lucide-react"
import { EmptyState } from "@/components/app/ui/EmptyState"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import type { CloudflareConnectionStatus, CloudflareCredentials } from "@/api/client"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { useDisconnectCloudflare } from "@/hooks/use-cloudflare-connection"
import { DisconnectDialog } from "./DisconnectDialog"
import { ProvisionCalm } from "./ProvisionCalm"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"
import { useElapsed } from "@/lib/elapsed"

/** The card swaps between a short summary and a much taller loader; animating the
 *  measured height keeps that from snapping the page around. */
function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setHeight(element.offsetHeight)
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, height }
}

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
  const body = useMeasuredHeight<HTMLDivElement>()

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
    <div>
      <div
        className="overflow-hidden rounded-xl border bg-card transition-[height] duration-500 ease-out motion-reduce:transition-none motion-safe:animate-in motion-safe:fade-in-0"
        style={body.height === null ? undefined : { height: body.height }}
      >
        <div ref={body.ref}>
        {isUpdating ? (
          <div
            key="updating"
            className="flex flex-col gap-4 px-5 py-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
          >
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
          <div
            key="connected"
            className="flex min-h-[calc(100vh-15rem)] flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
          >
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

            <EmptyState
              className="flex flex-1 items-center justify-center px-5 py-12"
              bloom
              illustration={
                <div className="relative mx-auto mb-7 size-40">
                  <span className="absolute inset-3 rounded-[2.5rem] bg-indigo-100/70 blur-2xl" />
                  <span className="absolute inset-5 grid place-items-center rounded-[1.75rem] border border-indigo-100 bg-white text-indigo-600 shadow-[0_24px_48px_-22px_rgba(79,70,229,0.5)]">
                    <BookOpen className="size-12" aria-hidden="true" />
                  </span>
                  <span className="absolute -right-1 top-1 grid size-10 place-items-center rounded-full border-2 border-card bg-emerald-500 text-white shadow-md">
                    <CheckCircle2 className="size-[1.125rem]" aria-hidden="true" />
                  </span>
                  <span className="absolute -bottom-1 -left-1 grid size-10 place-items-center rounded-full border-2 border-card bg-orange-100 text-orange-500 shadow-md">
                    <Cloud className="size-[1.125rem]" aria-hidden="true" />
                  </span>
                </div>
              }
              title={<span className="text-2xl font-semibold tracking-tight"><Trans>All set up</Trans></span>}
              description={
                <span className="text-base leading-7"><Trans>To share a book, open it and go to its Export step — you'll find Publish there.</Trans></span>
              }
            />

            <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
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
