import { Trans } from "@lingui/react/macro"
import { History, Loader2, MessagesSquare, Users } from "lucide-react"
import { PublishPanel } from "@/components/pipeline/stages/export/publish/PublishPanel"
import { PublicationReaders } from "@/components/publications/PublicationReaders"
import { ScrollBox } from "@/components/publishing/ScrollBox"
import {
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { useBook } from "@/hooks/use-books"
import { useElapsed } from "@/components/settings/publishing/provision-elapsed"
import { PublishingActions } from "./PublishingActions"
import { PublishingControls } from "./PublishingControls"
import { PublishingEngineNotice } from "./PublishingEngineNotice"
import { PublishingFreshness } from "./PublishingFreshness"
import { PublishingInvitation } from "./PublishingInvitation"
import { PublishingRecentFeedback } from "./PublishingRecentFeedback"
import { PublishingHero } from "./PublishingHero"
import { PublishingSection } from "./PublishingSection"
import { PublishingStepper, type PublishPhase } from "./PublishingStepper"
import { PublishingSummary } from "./PublishingSummary"
import { PublishingUpdateTakeover } from "./PublishingUpdateTakeover"
import { PublishingVersions } from "./PublishingVersions"

/**
 * Publishing, as its own place in the book rather than a card at the top of Export.
 *
 * A publication is not an export. An export is an artifact you produce once; a publication is a
 * living thing with an address, an audience, an access code and a history — which is why it sits
 * *before* Export in the rail.
 *
 * One page, no tabs, and two shapes.
 *
 * **Before a link exists** it is a narrow scrolling column: a stepper, then the one card that
 * asks for a decision. There is exactly one thing to do, and a wide page would bury it.
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
  const updating = run.status === "running" || run.status === "error"
  const elapsedMs = useElapsed(run.status === "running" ? "running" : run.status === "done" ? "done" : "idle")

  const phase: PublishPhase = !connected
    ? "connect"
    : run.status === "running"
      ? "running"
      : live
        ? "live"
        : "configure"

  if (status.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Trans>Checking whether this book is shared…</Trans>
      </div>
    )
  }

  if (!live) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-8 pb-12 pt-8">
          <Header />
          <PublishingStepper phase={phase} />
          <PublishingEngineNotice />
          <PublishPanel bookLabel={bookLabel} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-6 pt-6 mh:pb-4 mh:pt-4">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 mh:gap-4">
        <Header compact />

        <PublishingSummary
          bookLabel={bookLabel}
          record={record}
          currentVersion={currentVersion}
          hasAccessCode={status.data?.has_access_code ?? false}
        />

        {updating ? (
          <PublishingUpdateTakeover
            title={book.data?.title ?? bookLabel}
            fromVersion={currentVersion}
            run={run}
            elapsedMs={elapsedMs}
          />
        ) : (
        /* `min-h-0` on every ancestor of a scroll box, or the box grows instead of scrolling and
           takes the page with it. */
        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] mh:gap-4">
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

          <div className="grid min-h-0 grid-rows-[1.2fr_1.15fr_1fr] gap-4 mh:gap-3">
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

/** The page's own title. Compact once the dashboard is on screen: every pixel here is a pixel the
 *  roster does not get, and by then the hero names the book anyway. */
function Header({ compact = false }: { compact?: boolean }) {
  return (
    <header className="flex shrink-0 flex-col gap-1.5">
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a] mh:text-[22px]">
        <Trans>Publishing</Trans>
      </h1>
      {compact ? null : (
        <p className="max-w-2xl text-[14px] leading-relaxed text-[#737373]">
          <Trans>
            Put this book online for readers and reviewers. The copy lives in your own Cloudflare
            account, behind a link only the people you send it to can open.
          </Trans>
        </p>
      )}
    </header>
  )
}
