import { Trans } from "@lingui/react/macro"
import { History, MessagesSquare, Users } from "lucide-react"
import { PublicationReaders } from "@/components/publications/PublicationReaders"
import { ScrollBox } from "@/components/ui/ScrollBox"
import {
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { useBook } from "@/hooks/use-books"
import { useElapsed } from "@/lib/elapsed"
import { PublishingActions } from "./PublishingActions"
import { PublishingControls } from "./PublishingControls"
import { PublishingEngineNotice } from "./PublishingEngineNotice"
import { PublishingFreshness } from "./PublishingFreshness"
import { PublishingInvitation } from "./PublishingInvitation"
import { PublishingRecentFeedback } from "./PublishingRecentFeedback"
import { PublishingHero } from "./PublishingHero"
import { PublishingSection } from "./PublishingSection"
import { PublishingSummary } from "./PublishingSummary"
import { PublishingTakeover } from "./PublishingTakeover"
import { PublishingVersions } from "./PublishingVersions"
import { ShareSetup } from "./setup/ShareSetup"

/**
 * Publishing, as its own place in the book rather than a card at the top of Export.
 *
 * A publication is not an export. An export is an artifact you produce once; a publication is a
 * living thing with an address, an audience, an access code and a history — which is why it sits
 * *before* Export in the rail.
 *
 * One page, no tabs, and three shapes.
 *
 * **Before a link exists** it is a narrow scrolling column: a stepper, then the one card that
 * asks for a decision. There is exactly one thing to do, and a wide page would bury it.
 *
 * **While a run is going** — the first one or the hundredth — the page hands itself to the
 * takeover. A wait of minutes shown inside a card is a wait the author has to go looking for.
 *
 * **Once the link exists** it becomes a dashboard that *fits the window* — a two-row, two-column
 * grid pinned to the shell's height, with the two lists scrolling inside their own boxes. The
 * page itself never scrolls: an operations screen that has to be scrolled to find out whether
 * something is live has failed at its one job. That is also why the controls were compressed to
 * one line each, and why their warnings moved into confirmations — three explanatory paragraphs
 * used to push the roster below the fold.
 *
 * The Cloudflare connection deliberately stays in Settings: it belongs to the Studio, not to this
 * book, and offering it here would imply you connect an account per book.
 */
export function PublishingLandingPage({ bookLabel }: { bookLabel: string }) {
  const status = useBookPublication(bookLabel)
  const run = useBookPublishRun(bookLabel)
  const book = useBook(bookLabel)

  const connected = status.data?.connected === true
  const lifecycle = publicationLifecycle(status.data)
  const url = status.data?.url ?? run.result?.url ?? null
  const live = lifecycle === "active" && !!url
  const record = status.data?.record ?? null
  const token = record?.token ?? null
  const currentVersion = status.data?.publication?.current_version ?? null
  const newest = [...(record?.versions ?? [])].sort((a, b) => b.version - a.version)[0] ?? null
  /** A finished run whose link the status query has not caught up with yet. Without this the
   *  screen drops back to the "Publish this book" form for the moment between the last step and
   *  the refetch — a flash of the question, right after the answer. */
  const settling = run.status === "done" && !live && !status.isError
  const takingOver = run.status === "running" || run.status === "error" || settling
  const elapsedMs = useElapsed(run.status === "running" ? "running" : run.status === "done" ? "done" : "idle")

  /* Everything before a working link — loading, no account, a first share, a stopped or expired
     link, and the run that makes one — is one screen with one shape. It owns its own run view so
     the form stays mounted under it and a failed run hands back the same answers. */
  if (!live) {
    return (
      <ShareSetup
        bookLabel={bookLabel}
        run={run}
        elapsedMs={elapsedMs}
        takingOver={connected && takingOver}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-6 pt-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5">
        <Header />

        <PublishingSummary
          bookLabel={bookLabel}
          record={record}
          currentVersion={currentVersion}
          hasAccessCode={status.data?.has_access_code ?? false}
        />

        {takingOver ? (
          <PublishingTakeover
            title={book.data?.title ?? bookLabel}
            fromVersion={currentVersion}
            run={run}
            elapsedMs={elapsedMs}
            bookLabel={bookLabel}
          />
        ) : (
        /* `min-h-0` on every ancestor of a scroll box, or the box grows instead of scrolling and
           takes the page with it. */
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <PublishingHero
              bookLabel={bookLabel}
              title={book.data?.title ?? bookLabel}
              url={url as string}
              currentVersion={currentVersion}
              lastPublishedAt={newest?.published_at ?? null}
              workerReachable={status.data?.worker_reachable ?? true}
            />
            <PublishingFreshness
              contentRevision={status.data?.content_revision ?? null}
              liveVersion={newest}
              workerReachable={status.data?.worker_reachable ?? true}
            />

            <PublishingEngineNotice />

            <PublishingInvitation
              title={book.data?.title ?? bookLabel}
              url={url as string}
              accessCode={
                status.data?.has_access_code === true ? (record?.access_code ?? null) : null
              }
              expiresAt={record?.expires_at ?? null}
            />

            <PublishingControls
              bookLabel={bookLabel}
              record={record}
              hasAccessCode={status.data?.has_access_code ?? false}
              isUpdating={run.status === "running"}
            />
            </div>

            <PublishingActions
              bookLabel={bookLabel}
              isUpdating={run.status === "running"}
              onUpdate={run.update}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[1.2fr_1.15fr_1fr] gap-4">
            <PublishingSection
              icon={MessagesSquare}
              title={<Trans>Waiting on you</Trans>}
              className="min-h-0"
            >
              <ScrollBox>
                <PublishingRecentFeedback bookLabel={bookLabel} />
              </ScrollBox>
            </PublishingSection>

            <PublishingSection
              icon={Users}
              title={<Trans>Readers</Trans>}
              className="min-h-0"
              aside={<Trans>who gave a name</Trans>}
            >
              <ScrollBox
                footer={
                  <Trans>
                    Only people who typed a name are listed — somebody can read the book without
                    appearing here.
                  </Trans>
                }
              >
                {token === null ? null : (
                  <PublicationReaders token={token} hideHeading showFootnote={false} />
                )}
              </ScrollBox>
            </PublishingSection>

            <PublishingSection
              icon={History}
              title={<Trans>Version history</Trans>}
              className="min-h-0"
              aside={
                record?.versions.length ? <Trans>{record.versions.length} total</Trans> : null
              }
            >
              <ScrollBox>
                <PublishingVersions record={record} currentVersion={currentVersion} />
              </ScrollBox>
            </PublishingSection>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

/** The page's own title. The live dashboard drops the intro line: every pixel here is one the
 *  roster does not get, and by then the hero names the book anyway. */
function Header() {
  return (
    <header className="flex shrink-0 flex-col gap-1.5">
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
        <Trans>Sharing</Trans>
      </h1>
    </header>
  )
}
