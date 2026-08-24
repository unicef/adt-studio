import { Trans } from "@lingui/react/macro"
import { AlertTriangle, CalendarOff, CheckCircle2, Globe, Loader2, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCloudflareConnection } from "@/hooks/use-cloudflare-connection"
import { useCloudflareCredentials } from "@/hooks/use-cloudflare-credentials"
import { useAllProjectFeatures } from "@/hooks/use-export-features"
import {
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { PublishCalm } from "@/components/pipeline/stages/publish/PublishCalm"
import { useElapsed } from "@/components/settings/publishing/provision-elapsed"
import { PublishErrorNotice } from "./PublishErrorNotice"
import { PublishStartState } from "./PublishStartState"
import { PublishingSettingsLink } from "./PublishingSettingsLink"
import { RevokedNotice } from "./RevokedNotice"

/**
 * Everything before a link exists: no Cloudflare account, nothing published yet, a link the
 * author stopped, one that expired, and the run itself.
 *
 * It deliberately says nothing about a *live* publication. That belongs to the Publishing
 * dashboard, which owns the whole page and can give the link, its settings and its history a
 * column each — this card could only ever stack them. The page renders this panel only while
 * there is no live link, so the live branch that used to be here was unreachable code with a
 * second implementation of the same controls behind it.
 */
export function PublishPanel({ bookLabel }: { bookLabel: string }) {
  const status = useBookPublication(bookLabel)
  const { toggleable } = useAllProjectFeatures(bookLabel)
  const run = useBookPublishRun(bookLabel)
  const { credentials } = useCloudflareCredentials()
  const connected = status.data?.connected === true
  const connection = useCloudflareConnection(credentials, { enabled: connected })

  const lifecycle = publicationLifecycle(status.data)
  const url = status.data?.url ?? run.result?.url ?? null
  const isRunning = run.status === "running"
  const isLive = lifecycle === "active" && !!url
  /** The same clock the provisioning loader runs on, so both read "0:12" the same way. */
  const elapsedMs = useElapsed(run.status === "running" ? "running" : run.status === "done" ? "done" : "idle")

  return (
    // `shrink-0` is load-bearing, not tidiness. This sits in the shell's scrolling flex column,
    // and `overflow-hidden` (needed for the rounded corners) sets a flex item's automatic
    // minimum size to zero — so once the page overflows, the column is free to squeeze this
    // whole card down to its two borders. It did exactly that, and the panel vanished.
    <section
      data-testid="publish-panel"
      className="shrink-0 overflow-hidden rounded-2xl border border-indigo-200/80 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b border-indigo-100 bg-indigo-50/60 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white shadow-sm">
            <Globe className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              <Trans>Share online</Trans>
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              <Trans>
                Publish a private, shareable copy for readers and reviewers. No download or install
                needed.
              </Trans>
            </p>
          </div>
        </div>

        {!status.isPending && !status.isError && connected && (
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-800">
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : isLive ? (
              <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <span className="size-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
            )}
            {isRunning ? (
              <Trans>Publishing</Trans>
            ) : isLive ? (
              <Trans>Live</Trans>
            ) : lifecycle === "revoked" ? (
              <Trans>Sharing stopped</Trans>
            ) : lifecycle === "expired" ? (
              <Trans>Link expired</Trans>
            ) : (
              <Trans>Ready to publish</Trans>
            )}
          </span>
        )}
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
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
            className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <Trans>We couldn't check whether this book is shared</Trans>
            </span>
            <p className="text-sm leading-6 text-muted-foreground">
              <Trans>
                Nothing is wrong with your book. The Studio just couldn't reach the part of itself that
                keeps track of published books. Try again in a moment.
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
            className="grid gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              <Trans>
                Sharing needs a Cloudflare account connected once. It's free, and the book lives in
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
          <div className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
            {lifecycle === "revoked" && (
              <RevokedNotice bookLabel={bookLabel} disabled={isRunning} />
            )}

            {lifecycle === "expired" && (
              <div
                data-testid="publication-expired"
                className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 p-4"
              >
                <CalendarOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm leading-6 text-muted-foreground">
                  <Trans>
                    This book's link has reached its end date and no longer opens. Publishing again
                    gives you a new link to share.
                  </Trans>
                </p>
              </div>
            )}

            {lifecycle === "active" && !url && (
              <div
                data-testid="publication-link-missing"
                className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <p className="text-sm leading-6 text-muted-foreground">
                  <Trans>
                    This book is shared, but the Studio couldn't work out its link just now. Try again
                    in a moment. The link people already have keeps working.
                  </Trans>
                </p>
              </div>
            )}

            {lifecycle !== "active" && (
              <PublishStartState
                available={toggleable}
                kind={lifecycle === "none" ? "first" : "again"}
                isRunning={isRunning}
                hasFailed={run.status === "error"}
                secondary={lifecycle === "revoked"}
                onPublish={(options) => run.publish(options)}
              />
            )}

            {(run.status === "running" || run.status === "error") && (
              <div className="border-t border-border pt-5">
                <PublishCalm
                  status={run.status}
                  stepStates={run.stepStates}
                  activeStep={run.activeStep}
                  elapsedMs={elapsedMs}
                  kind={run.kind === "update" ? "update" : "first"}
                />
                {run.status === "error" && run.failure && (
                  <div className="mt-4">
                    <PublishErrorNotice failure={run.failure} />
                  </div>
                )}
              </div>
            )}

            {connection.data?.upgrade_available && (
              <p data-testid="publish-upgrade-hint" className="text-xs leading-5 text-muted-foreground">
                <Trans>
                  A publishing service update is waiting in Settings → Publishing. Installing it isn't
                  urgent. Your link keeps working either way.
                </Trans>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
