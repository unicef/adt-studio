import { Trans } from "@lingui/react/macro"
import { AlertTriangle, CalendarOff, Globe, Loader2, Link2 } from "lucide-react"
import { SettingsCard } from "@/components/pipeline/components/SettingsCard"
import { Button } from "@/components/ui/button"
import { useCloudflareConnection } from "@/hooks/use-cloudflare-connection"
import { useCloudflareCredentials } from "@/hooks/use-cloudflare-credentials"
import {
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { PublishChecklist } from "./PublishChecklist"
import { PublishErrorNotice } from "./PublishErrorNotice"
import { PublishStartState } from "./PublishStartState"
import { PublishedState } from "./PublishedState"
import { PublishingSettingsLink } from "./PublishingSettingsLink"

/**
 * "Share online" — the publish half of the Export stage. Sits beside the export
 * formats because publishing *is* the web export, sent somewhere instead of
 * downloaded.
 */
export function PublishPanel({ bookLabel }: { bookLabel: string }) {
  const status = useBookPublication(bookLabel)
  const run = useBookPublishRun(bookLabel)
  const { credentials } = useCloudflareCredentials()
  const connected = status.data?.connected === true
  const connection = useCloudflareConnection(credentials, { enabled: connected })

  const lifecycle = publicationLifecycle(status.data)
  const url = status.data?.url ?? run.result?.url ?? null
  const isRunning = run.status === "running"
  const recentRun = run.status === "done" ? run.kind : null

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-2">
          <Globe className="size-4 text-indigo-700" aria-hidden="true" />
          <Trans>Share online</Trans>
        </span>
      }
      description={
        <Trans>
          Put a copy of this book online in your own Cloudflare account and share it with a link —
          no download, no install for the people you send it to.
        </Trans>
      }
    >
      {status.isPending && (
        <div
          data-testid="publication-loading"
          className="flex items-center gap-2.5 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <Trans>Checking whether this book is shared…</Trans>
        </div>
      )}

      {!status.isPending && status.isError && (
        <div
          data-testid="publication-unavailable"
          className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <Trans>We couldn't check whether this book is shared</Trans>
          </span>
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              Nothing is wrong with your book. The Studio just couldn't reach the part of itself that
              keeps track of published books — try again in a moment.
            </Trans>
          </p>
          {status.error?.message && (
            <p className="text-xs leading-5 text-muted-foreground">{status.error.message}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
          >
            {status.isFetching && (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            )}
            <Trans>Try again</Trans>
          </Button>
        </div>
      )}

      {!status.isPending && !status.isError && !connected && (
        <div
          data-testid="publish-not-connected"
          className="flex flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
        >
          <p className="text-sm leading-6 text-muted-foreground">
            <Trans>
              Sharing needs a Cloudflare account connected once — it's free, and the book lives in
              your own account, not ours. The Studio walks you through it in a few clicks.
            </Trans>
          </p>
          <PublishingSettingsLink className="self-start">
            <Link2 aria-hidden="true" />
            <Trans>Set up publishing</Trans>
          </PublishingSettingsLink>
        </div>
      )}

      {!status.isPending && !status.isError && connected && (
        <div className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
          {(lifecycle === "revoked" || lifecycle === "expired") && (
            <div
              data-testid={`publication-${lifecycle}`}
              className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3.5"
            >
              <CalendarOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm leading-6 text-muted-foreground">
                {lifecycle === "revoked" ? (
                  <Trans>
                    You stopped sharing this book, so the old link no longer opens. Publishing again
                    gives you a new link to share.
                  </Trans>
                ) : (
                  <Trans>
                    This book's link has reached its end date and no longer opens. Publishing again
                    gives you a new link to share.
                  </Trans>
                )}
              </p>
            </div>
          )}

          {lifecycle === "active" && !url && (
            <div
              data-testid="publication-link-missing"
              className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-sm leading-6 text-muted-foreground">
                <Trans>
                  This book is shared, but the Studio couldn't work out its link just now. Try again
                  in a moment — the link people already have keeps working.
                </Trans>
              </p>
            </div>
          )}

          {lifecycle === "active" && url && (
            <PublishedState
              bookLabel={bookLabel}
              url={url}
              record={status.data?.record ?? null}
              publication={status.data?.publication ?? null}
              workerReachable={status.data?.worker_reachable ?? true}
              isUpdating={isRunning}
              recentRun={recentRun}
              onUpdate={run.update}
            />
          )}

          {lifecycle !== "active" && (
            <PublishStartState
              kind={lifecycle === "none" ? "first" : "again"}
              isRunning={isRunning}
              hasFailed={run.status === "error"}
              onPublish={(expiresAt) => run.publish(expiresAt)}
            />
          )}

          {(run.status === "running" || run.status === "error") && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3.5">
              <PublishChecklist
                status={run.status}
                kind={run.kind}
                stepStates={run.stepStates}
                activeStep={run.activeStep}
              />
              {run.status === "error" && run.failure && (
                <PublishErrorNotice failure={run.failure} />
              )}
            </div>
          )}

          {connection.data?.upgrade_available && (
            <p data-testid="publish-upgrade-hint" className="text-xs leading-5 text-muted-foreground">
              <Trans>
                A publishing service update is waiting in Settings → Publishing. Installing it isn't
                urgent — your link keeps working either way.
              </Trans>
            </p>
          )}
        </div>
      )}
    </SettingsCard>
  )
}
