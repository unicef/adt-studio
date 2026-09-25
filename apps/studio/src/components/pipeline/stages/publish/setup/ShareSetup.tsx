import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, CalendarOff, Globe, Link2, Link2Off, Loader2, Play, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OVERFLOW_MASK, useOverflowEdges } from "@/components/ui/ScrollBox"
import { useBook } from "@/hooks/use-books"
import { useCloudflareConnection } from "@/hooks/use-cloudflare-connection"
import { useCloudflareCredentials } from "@/hooks/use-cloudflare-credentials"
import { useAllProjectFeatures } from "@/hooks/use-export-features"
import {
  publicationLifecycle,
  useBookPublication,
  useResumePublication,
  type BookPublishRunController,
} from "@/hooks/use-book-publication"
import { cn } from "@/lib/utils"
import { formatPublishDate } from "../expiry-options"
import { PublishingEngineNotice } from "../PublishingEngineNotice"
import { PublishingSettingsLink } from "../PublishingSettingsLink"
import { PublishingTakeover } from "../PublishingTakeover"
import { ConnectCallout } from "./ConnectCallout"
import { ReaderPreview, type PreviewMode } from "./ReaderPreview"
import { FadeSwap, Reveal } from "./Reveal"
import { SettingsFields } from "./SettingsFields"
import { SetupSkeleton } from "./SetupSkeleton"
import { StatusCallout } from "./StatusCallout"
import { useShareForm } from "./useShareForm"

type SetupState = "loading" | "check-failed" | "not-connected" | "first" | "stopped" | "expired" | "link-missing"

/**
 * Sharing, before a working link exists — and the run that makes one.
 *
 * Two columns that never change shape between states: what the author decides on the left, what
 * a reader will meet on the right. A state only changes what fills three fixed slots — the
 * callout at the top of the panel, the reader's view, and the one primary action in the panel's
 * footer — and each slot animates its change, so moving between states never jolts the page.
 *
 * The run renders here too, in place of the columns, rather than on a page of its own. That keeps
 * the form mounted underneath it: a run that fails and hands the form back hands back the same
 * answers, down to the access code the author may already have given out.
 */
export function ShareSetup({
  bookLabel,
  run,
  elapsedMs,
  takingOver,
}: {
  bookLabel: string
  run: BookPublishRunController
  elapsedMs: number
  takingOver: boolean
}) {
  const status = useBookPublication(bookLabel)
  const book = useBook(bookLabel)
  const { toggleable } = useAllProjectFeatures(bookLabel)
  const { credentials } = useCloudflareCredentials()
  const connected = status.data?.connected === true
  const connection = useCloudflareConnection(credentials, { enabled: connected })
  const resume = useResumePublication(bookLabel)
  const form = useShareForm(toggleable)
  const scroller = useOverflowEdges<HTMLDivElement>()

  const lifecycle = publicationLifecycle(status.data)
  const state: SetupState = status.isPending
    ? "loading"
    : status.isError
      ? "check-failed"
      : !connected
        ? "not-connected"
        : lifecycle === "revoked"
          ? "stopped"
          : lifecycle === "expired"
            ? "expired"
            : lifecycle === "active"
              ? "link-missing"
              : "first"

  const shareBook = { label: bookLabel, title: book.data?.title ?? bookLabel }
  const serviceNotice =
    connected &&
    connection.data?.connected === true &&
    (!connection.data.worker_reachable || connection.data.upgrade_available)
  const locked = state === "check-failed" || state === "link-missing"
  const body = takingOver ? "run" : state === "loading" ? "loading" : "setup"

  return (
    <div data-testid="publish-setup" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-6 pt-7 lg:overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
        <header className="mb-5 flex min-w-0 flex-col gap-1">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
            <Trans>Sharing</Trans>
          </h1>
          <p className="text-sm leading-6 text-[#737373]">
            <Trans>Put a private copy online. Readers open it in their browser — nothing to install.</Trans>
          </p>
        </header>

        <Reveal show={serviceNotice && !takingOver} className="pb-5">
          <PublishingEngineNotice />
        </Reveal>

        <FadeSwap id={body} className="flex min-h-0 flex-1 flex-col">
          {body === "run" ? (
            <PublishingTakeover
              title={shareBook.title}
              fromVersion={null}
              run={run}
              elapsedMs={elapsedMs}
              bookLabel={bookLabel}
            />
          ) : body === "loading" ? (
            <SetupSkeleton />
          ) : (
            <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
              <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
                <div
                  ref={scroller.ref}
                  className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-5",
                    OVERFLOW_MASK[scroller.edges],
                  )}
                >
                  <Reveal show={state !== "first" && state !== "not-connected"} className="pb-5">
                    <FadeSwap id={state}>
                      <Callout state={state} status={status} />
                    </FadeSwap>
                  </Reveal>
                  <FadeSwap id={state === "not-connected" ? "connect" : "fields"} className="flex flex-1 flex-col">
                    {state === "not-connected" ? (
                      <ConnectCallout />
                    ) : (
                      <SettingsFields form={form} disabled={locked} />
                    )}
                  </FadeSwap>
                </div>
                <div className="shrink-0 border-t bg-muted/20 p-5">
                  <FadeSwap id={state} className="flex flex-col gap-2">
                    <Actions
                      state={state}
                      codeReady={form.codeReady}
                      retrying={status.isFetching}
                      resume={resume}
                      onRetry={() => void status.refetch()}
                      onShare={() => run.publish(form.toPublishOptions())}
                    />
                  </FadeSwap>
                </div>
              </section>

              <ReaderPreview
                book={shareBook}
                form={form}
                mode={previewMode(state)}
                url={state === "stopped" ? (status.data?.url ?? status.data?.record?.base_url ?? null) : null}
              />
            </div>
          )}
        </FadeSwap>
      </div>
    </div>
  )
}

function previewMode(state: SetupState): PreviewMode {
  if (state === "not-connected") return "locked"
  if (state === "check-failed" || state === "link-missing") return "unknown"
  if (state === "stopped") return "stopped"
  return "gate"
}

function Callout({ state, status }: { state: SetupState; status: ReturnType<typeof useBookPublication> }) {
  const { i18n } = useLingui()
  const expiresAt = status.data?.publication?.expires_at ?? status.data?.record?.expires_at ?? null

  switch (state) {
    case "stopped":
      return (
        <StatusCallout testId="publication-revoked" tone="neutral" icon={Link2Off} title={<Trans>Sharing is stopped</Trans>}>
          <Trans>The link doesn't open right now. Resuming turns the same link back on, with every comment kept.</Trans>
        </StatusCallout>
      )
    case "expired":
      return (
        <StatusCallout testId="publication-expired" tone="neutral" icon={CalendarOff} title={<Trans>The link reached its end date</Trans>}>
          {expiresAt ? (
            <Trans>It stopped opening on {formatPublishDate(expiresAt, i18n.locale)}. Sharing again makes a new one.</Trans>
          ) : (
            <Trans>It no longer opens. Sharing again makes a new one.</Trans>
          )}
        </StatusCallout>
      )
    case "link-missing":
      return (
        <StatusCallout testId="publication-link-missing" tone="warning" icon={AlertTriangle} title={<Trans>We couldn't find this book's link</Trans>}>
          <Trans>The book is shared, but its link didn't come back just now. The link people already have keeps working.</Trans>
        </StatusCallout>
      )
    case "check-failed":
      return (
        <StatusCallout testId="publication-unavailable" tone="warning" icon={AlertTriangle} title={<Trans>We couldn't check this book</Trans>}>
          <Trans>Nothing is wrong with your book. The Studio couldn't reach its list of shared books.</Trans>
          {status.error?.message ? (
            <span className="mt-1.5 block break-words font-mono text-[11px] text-muted-foreground/80">
              {status.error.message}
            </span>
          ) : null}
        </StatusCallout>
      )
    default:
      return null
  }
}

function Actions({
  state,
  codeReady,
  retrying,
  resume,
  onRetry,
  onShare,
}: {
  state: SetupState
  codeReady: boolean
  retrying: boolean
  resume: ReturnType<typeof useResumePublication>
  onRetry: () => void
  onShare: () => void
}) {
  const caption = (children: ReactNode) => (
    <p className="text-center text-xs leading-5 text-muted-foreground">{children}</p>
  )

  if (state === "not-connected") {
    return (
      <>
        <PublishingSettingsLink size="lg" className="w-full">
          <Link2 aria-hidden="true" />
          <Trans>Set up sharing</Trans>
        </PublishingSettingsLink>
        {caption(<Trans>Takes about a minute, and it's free.</Trans>)}
      </>
    )
  }

  if (state === "check-failed" || state === "link-missing") {
    return (
      <>
        <Button size="lg" variant="outline" className="w-full bg-white" disabled={retrying} onClick={onRetry}>
          {retrying ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          <Trans>Try again</Trans>
        </Button>
        {caption(<Trans>Your choices are kept while you wait.</Trans>)}
      </>
    )
  }

  if (state === "stopped") {
    return (
      <>
        <Button
          data-testid="publish-resume-button"
          size="lg"
          className="w-full"
          disabled={resume.isPending}
          onClick={() => resume.mutate()}
        >
          {resume.isPending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {resume.isPending ? <Trans>Resuming…</Trans> : <Trans>Resume sharing</Trans>}
        </Button>
        {resume.error ? (
          <div
            data-testid="publish-resume-error"
            role="alert"
            className="flex flex-col gap-0.5 text-center motion-safe:animate-in motion-safe:fade-in-0"
          >
            <p className="text-xs leading-5 text-destructive">
              <Trans>Sharing couldn't be resumed, so the link is still off.</Trans>
            </p>
            <p className="break-words text-[11px] leading-4 text-muted-foreground">{resume.error.message}</p>
          </div>
        ) : null}
        <Button
          data-testid="publish-start-button"
          variant="ghost"
          className="w-full text-muted-foreground"
          disabled={!codeReady || resume.isPending}
          onClick={onShare}
        >
          <Trans>Or share on a new link with the choices above</Trans>
        </Button>
      </>
    )
  }

  return (
    <>
      <Button data-testid="publish-start-button" size="lg" className="w-full" disabled={!codeReady} onClick={onShare}>
        <Globe aria-hidden="true" />
        {state === "expired" ? <Trans>Share again</Trans> : <Trans>Share and get a link</Trans>}
      </Button>
      {caption(
        state === "expired" ? (
          <Trans>Readers will need the new link — the old one stays closed.</Trans>
        ) : (
          <Trans>Readers see the book as it is now. You can change these later.</Trans>
        ),
      )}
    </>
  )
}
