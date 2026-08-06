import { Link } from "@tanstack/react-router"
import { Check, Copy, MessagesSquare } from "lucide-react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { publicationStateAt, type PublicationSummary } from "@adt/types"
import { Button } from "@/components/ui/button"
import { ExternalLinkButton } from "@/components/settings/publishing/ExternalLinkButton"
import { PublicationStatusChip } from "@/components/publications/PublicationStatusChip"
import { useCopyLink } from "@/hooks/use-copy-link"

interface BookPublishedStripProps {
  publication: PublicationSummary
  /** `false` when the publishing service could not be reached: the counts on this summary were
   *  reconstructed from this machine's own record and were never measured. */
  countsKnown: boolean
}

/**
 * The band under a book card saying this book is online.
 *
 * It exists because "is this one shared, and has anybody said anything?" was a question the home
 * screen could not answer — the author had to open a book and walk to its Publishing stage to
 * find out, for each book in turn. The three things on this band are the three things they went
 * looking for: the state of the link, the link itself, and whether feedback is waiting.
 *
 * Rendered outside the card's own `<Link>`, never inside it: an anchor within an anchor is
 * invalid and the browser's own guess about which one a click meant is not worth inheriting.
 */
export function BookPublishedStrip({ publication, countsKnown }: BookPublishedStripProps) {
  const { t } = useLingui()
  const state = publicationStateAt(publication)
  const url = publication.url
  const { copied, failed, copy } = useCopyLink(url ?? "")
  const unresolved = publication.unresolved_count

  return (
    <div
      data-testid={`book-published-strip-${publication.book_label}`}
      data-state={state}
      /** Neutral on purpose. A tinted band competed with the badges above it and read as a
       *  status message about the whole card, when the only thing carrying status here is the
       *  chip — a stopped link on a green shelf was the tell. */
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-b-xl border-t bg-muted/30 px-5 py-2"
    >
      <PublicationStatusChip state={state} />

      {url ? (
        <>
          {/* The address is text, not a link: the button beside it is the one that opens, and in
              the desktop app that distinction is what keeps the book out of the Electron window
              and in a real browser. */}
          <code
            title={url}
            className="min-w-0 flex-1 truncate rounded bg-background/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {url}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => void copy()}
            aria-label={t`Copy the link to ${publication.title}`}
            title={copied ? t`Link copied` : failed ? t`Couldn't copy the link` : t`Copy link`}
          >
            {copied ? (
              <Check
                className="size-3.5 text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
                aria-hidden="true"
              />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
          </Button>
          {/* Called "Open", not "Preview": this card already carries a Preview badge for the
              pipeline stage of that name, and two different meanings of one word eight pixels
              apart is a trap. */}
          <ExternalLinkButton
            href={url}
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            aria-label={t`Open ${publication.title} as readers see it`}
          >
            <Trans>Open</Trans>
          </ExternalLinkButton>
        </>
      ) : (
        <span className="min-w-0 flex-1" />
      )}

      {countsKnown ? (
        <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs">
          <Link
            to="/books/$label/$step"
            params={{ label: publication.book_label, step: "storyboard" }}
            title={t`Read the feedback on ${publication.title}`}
          >
            <MessagesSquare className="size-3.5" aria-hidden="true" />
            {publication.comment_count === 0 ? (
              <span className="text-muted-foreground">
                <Trans>No comments</Trans>
              </span>
            ) : (
              <Plural value={publication.comment_count} one="# comment" other="# comments" />
            )}
            {unresolved > 0 ? (
              <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">
                {unresolved > 99 ? <Trans>99+ open</Trans> : <Trans>{unresolved} open</Trans>}
              </span>
            ) : null}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
