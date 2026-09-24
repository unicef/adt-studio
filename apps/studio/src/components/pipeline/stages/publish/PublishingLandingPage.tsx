import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import {
  type BookPublishRunController,
  publicationLifecycle,
  useBookPublication,
  useBookPublishRun,
} from "@/hooks/use-book-publication"
import { useBook } from "@/hooks/use-books"
import { usePublishScreenPresence } from "@/hooks/use-publish-run-notice"
import { useElapsed } from "@/lib/elapsed"
import { useSharingDashboardData, useSharingLink } from "./dashboard/dashboard-data"
import { SharingDashboard } from "./dashboard/SharingDashboard"
import { SharingDashboardSkeleton } from "./dashboard/SharingDashboardSkeleton"
import { useExpectsLiveLink } from "./dashboard/use-expects-live"
import { PublishingTakeover } from "./PublishingTakeover"
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
 * **Once the link exists** it becomes a dashboard that *fits the window*: a hero that hands the
 * book over, and Overview · Feedback · Readers tabs whose panels scroll inside their own boxes.
 * The page itself never scrolls: an operations screen that has to be scrolled to find out whether
 * something is live has failed at its one job. The rarely-changed settings live in a sheet.
 *
 * The Cloudflare connection deliberately stays in Settings: it belongs to the Studio, not to this
 * book, and offering it here would imply you connect an account per book.
 */
export function PublishingLandingPage({ bookLabel }: { bookLabel: string }) {
  const status = useBookPublication(bookLabel)
  const run = useBookPublishRun(bookLabel)
  usePublishScreenPresence(bookLabel)
  const book = useBook(bookLabel)

  const connected = status.data?.connected === true
  const lifecycle = publicationLifecycle(status.data)
  const url = status.data?.url ?? run.result?.url ?? null
  const live = lifecycle === "active" && !!url
  const currentVersion = status.data?.publication?.current_version ?? null
  /** A finished run whose link the status query has not caught up with yet. Without this the
   *  screen drops back to the "Publish this book" form for the moment between the last step and
   *  the refetch — a flash of the question, right after the answer. */
  const settling = run.status === "done" && !live && !status.isError
  const takingOver = run.status === "running" || run.status === "error" || settling
  const expectsLive = useExpectsLiveLink(bookLabel, status.data ? live : null)
  const elapsedMs = useElapsed(run.status === "running" ? "running" : run.status === "done" ? "done" : "idle")

  /* While the status is on its way, a book that was live last time waits in the dashboard's own
     shape rather than the setup form's. */
  const waiting = status.isPending && expectsLive && !takingOver

  /* Everything before a working link — loading, no account, a first share, a stopped or expired
     link, and the run that makes one — is one screen with one shape. It owns its own run view so
     the form stays mounted under it and a failed run hands back the same answers. */
  if (!live && !waiting) {
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
    <DashboardFrame>
      {waiting ? (
        <SharingDashboardSkeleton />
      ) : takingOver ? (
        <PublishingTakeover
          title={book.data?.title ?? bookLabel}
          fromVersion={currentVersion}
          run={run}
          elapsedMs={elapsedMs}
          bookLabel={bookLabel}
        />
      ) : (
        <LiveDashboard bookLabel={bookLabel} run={run} />
      )}
    </DashboardFrame>
  )
}

/** The live page's frame: the title, then whatever fills the window under it. */
function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-6 pt-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5">
        <Header />
        {children}
      </div>
    </div>
  )
}

/** The dashboard's queries live here, so they only run once there is a live link to ask about. */
function LiveDashboard({ bookLabel, run }: { bookLabel: string; run: BookPublishRunController }) {
  const link = useSharingLink(bookLabel, run)
  const data = useSharingDashboardData(bookLabel, link)
  return <SharingDashboard data={data} />
}

/** The page's own title. The live dashboard drops the intro line: every pixel here is one the
 *  roster does not get, and by then the hero names the book anyway. */
function Header() {
  return (
    <header className="flex shrink-0 flex-col gap-1.5">
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">
        <Trans>Sharing</Trans>
      </h1>
    </header>
  )
}
