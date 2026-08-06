import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  Check,
  ChevronDown,
  Copy,
  FolderX,
  Loader2,
  Link2Off,
  MessagesSquare,
  Play,
  RefreshCw,
  Users,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  publicationStateAt,
  type PublicationReader,
  type PublicationSummary,
} from "@adt/types"
import { Button } from "@/components/ui/button"
import { ExternalLinkButton } from "@/components/settings/publishing/ExternalLinkButton"
import { formatPublishDate } from "@/components/pipeline/stages/export/publish/expiry-options"
import { cn } from "@/lib/utils"
import { AccessCodeChip, PublicationStatusChip } from "./PublicationStatusChip"
import { PublicationCover } from "./PublicationCover"
import { PublicationReaders } from "./PublicationReaders"
import { formatStorage } from "./format"

const COPY_FEEDBACK_MS = 2500

/**
 * A row action that opens one of this book's own stages.
 *
 * Disabled is not a styling detail here: `/books/:label/…` answers `404` for a book that is no
 * longer on this machine, so the link must not exist rather than lead somewhere broken. The
 * disabled branch keeps the icon and the label on one flex line, which a bare `<span>` inside
 * `Button` would not — the button's own `gap` applies to its children, not to the slot's.
 */
function StepAction({
  enabled,
  variant,
  label,
  step,
  disabledHint,
  children,
}: {
  enabled: boolean
  variant: "outline" | "ghost"
  label: string
  step: "feedback" | "export"
  disabledHint: string
  children: ReactNode
}) {
  return (
    <Button
      asChild={enabled}
      type="button"
      variant={variant}
      size="sm"
      disabled={!enabled}
      className="h-8 justify-start gap-2 text-xs"
      title={enabled ? undefined : disabledHint}
    >
      {enabled ? (
        <Link to="/books/$label/$step" params={{ label, step }}>
          {children}
        </Link>
      ) : (
        <span className="flex flex-1 items-center gap-2">{children}</span>
      )}
    </Button>
  )
}

export interface PublicationRowProps {
  publication: PublicationSummary
  /** `false` while the worker is unreachable: the counts and sizes on this row were never
   *  measured, so the row shows dashes instead of zeroes. */
  countsKnown: boolean
  busy: boolean
  /** Position in the list, used only to stagger the entrance. Capped, so a long shelf does not
   *  make the last row wait. */
  index: number
  /** Handed straight to the readers panel instead of fetching. Only the demo shelf sets it. */
  readers?: readonly PublicationReader[]
  onStop: () => void
  onResume: () => void
}

export function PublicationRow({
  publication,
  countsKnown,
  busy,
  index,
  readers,
  onStop,
  onResume,
}: PublicationRowProps) {
  const { t, i18n } = useLingui()
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [readersOpen, setReadersOpen] = useState(false)
  /** Sticky: the panel stays mounted after the first open so closing can animate, and so a
   *  second look does not re-request a roster the cache already holds. */
  const [readersEverOpened, setReadersEverOpened] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const url = publication.url
  const state = publicationStateAt(publication)
  const unknown = t`—`
  const titleId = `publication-title-${publication.token}`
  const readersId = `publication-readers-${publication.token}`

  function toggleReaders() {
    setReadersOpen(!readersOpen)
    if (!readersOpen) setReadersEverOpened(true)
  }

  async function copyLink() {
    if (!url) return
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(url)
      setCopyFailed(false)
      setCopied(true)
    } catch {
      setCopied(false)
      setCopyFailed(true)
    }
    timerRef.current = setTimeout(() => {
      setCopied(false)
      setCopyFailed(false)
    }, COPY_FEEDBACK_MS)
  }

  return (
    <li
      data-testid={`publication-row-${publication.book_label}`}
      data-state={state}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: "both" }}
      className="rounded-xl border bg-card transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-sm motion-safe:animate-wizard-enter motion-reduce:transition-none"
    >
      <article
        aria-labelledby={titleId}
        className="flex flex-col gap-3 p-4 mh:gap-2 mh:p-3 lg:flex-row lg:items-start lg:gap-4"
      >
        <div className="flex min-w-0 flex-1 gap-3">
        <PublicationCover
          label={publication.book_label}
          title={publication.title}
          bookExists={publication.book_exists}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={titleId} className="truncate text-sm font-semibold leading-6">
              {publication.title}
            </h3>
            <PublicationStatusChip state={state} />
            {publication.has_access_code ? (
              <AccessCodeChip code={publication.access_code} />
            ) : null}
            {publication.book_exists ? null : (
              <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">
                <FolderX className="size-3" aria-hidden="true" />
                <Trans>Book no longer on this computer</Trans>
              </span>
            )}
          </div>

          {url ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <code className="min-w-0 truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">
                {url}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => void copyLink()}
                aria-label={t`Copy the link to ${publication.title}`}
                title={t`Copy link`}
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
              <ExternalLinkButton
                href={url}
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
              >
                <Trans>Open</Trans>
              </ExternalLinkButton>
            </div>
          ) : null}

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <dt>
                <Trans>Versions</Trans>
              </dt>
              <dd className="tabular-nums text-foreground/70">
                <Trans>
                  {publication.version_count} — now serving v{publication.current_version}
                </Trans>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>
                <Trans>Updated</Trans>
              </dt>
              <dd className="tabular-nums text-foreground/70">
                {publication.last_published_at
                  ? formatPublishDate(publication.last_published_at, i18n.locale)
                  : unknown}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>
                <Trans>Size</Trans>
              </dt>
              <dd className="tabular-nums text-foreground/70">
                {publication.snapshot_bytes === null
                  ? unknown
                  : formatStorage(publication.snapshot_bytes, i18n.locale)}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>
                <Trans>Expiry</Trans>
              </dt>
              <dd className="tabular-nums text-foreground/70">
                {publication.expires_at ? (
                  formatPublishDate(publication.expires_at, i18n.locale)
                ) : (
                  <Trans>No end date</Trans>
                )}
              </dd>
            </div>
          </dl>

          <span role="status" aria-live="polite" className="text-xs leading-5 text-emerald-700">
            {copied ? <Trans>Link copied to the clipboard.</Trans> : null}
            {copyFailed ? (
              <span className="text-amber-700">
                <Trans>Couldn't copy — select the link above and copy it by hand.</Trans>
              </span>
            ) : null}
          </span>

        </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:w-44 lg:flex-col lg:items-stretch lg:border-l lg:pl-4">
          <StepAction
            enabled={publication.book_exists}
            variant="outline"
            label={publication.book_label}
            step="feedback"
            disabledHint={t`This book is not on this computer`}
          >
            <MessagesSquare className="size-3.5" aria-hidden="true" />
            <Trans>Feedback</Trans>
            {countsKnown && publication.unresolved_count > 0 ? (
              <span className="ml-auto rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold leading-4 text-white tabular-nums">
                {publication.unresolved_count > 99 ? t`99+` : publication.unresolved_count}
              </span>
            ) : null}
          </StepAction>

          <StepAction
            enabled={publication.book_exists}
            variant="ghost"
            label={publication.book_label}
            step="export"
            disabledHint={t`This book is not on this computer`}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <Trans>Update site</Trans>
          </StepAction>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={readersOpen}
            aria-controls={readersId}
            onClick={toggleReaders}
            className="h-8 justify-start gap-2 text-xs text-muted-foreground"
          >
            <Users className="size-3.5" aria-hidden="true" />
            <Trans>Readers</Trans>
            <ChevronDown
              className={cn(
                "ml-auto size-3.5 transition-transform duration-300 ease-out motion-reduce:transition-none",
                readersOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !publication.book_exists}
            onClick={state === "revoked" ? onResume : onStop}
            className={cn(
              "h-8 justify-start gap-2 text-xs",
              state === "revoked" ? "text-emerald-700" : "text-muted-foreground",
            )}
            title={publication.book_exists ? undefined : t`This book is not on this computer`}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : state === "revoked" ? (
              <Play className="size-3.5" aria-hidden="true" />
            ) : (
              <Link2Off className="size-3.5" aria-hidden="true" />
            )}
            {state === "revoked" ? <Trans>Resume sharing</Trans> : <Trans>Stop sharing</Trans>}
          </Button>
        </div>
      </article>

      {/* A drawer under the whole card rather than a block inside the text column: it spans the
          divider, and `grid-rows` from 0fr to 1fr is the one height transition that works
          without measuring. `transition-discrete` holds `visibility` until the collapse has
          finished, so closing fades out instead of blinking away — and once closed the panel is
          out of the tab order. Mounted from the first open onwards, never before: that is what
          keeps a shelf of forty books from fetching forty rosters. */}
      {readersEverOpened && (
        <div
          id={readersId}
          aria-hidden={!readersOpen}
          className={cn(
            "grid overflow-hidden transition-all duration-300 ease-out transition-discrete motion-reduce:transition-none",
            readersOpen ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0">
            <div className="border-t px-4 py-3 mh:px-3">
              <PublicationReaders token={publication.token} override={readers} />
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
