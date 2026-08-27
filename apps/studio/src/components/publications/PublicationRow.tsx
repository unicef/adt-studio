import { useState, type ReactNode } from "react"
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
  Trash2,
  Users,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { publicationStateAt, type PublicationSummary } from "@adt/types"
import { Button } from "@/components/ui/button"
import { ExternalLinkButton } from "@/components/settings/publishing/ExternalLinkButton"
import { formatPublishDate } from "@/components/pipeline/stages/publish/expiry-options"
import { useCopyLink } from "@/hooks/use-copy-link"
import { cn } from "@/lib/utils"
import { PublishingSettingsLink } from "@/components/pipeline/stages/publish/PublishingSettingsLink"
import { apiErrorCode } from "@/api/client"
import { AccessCodeChip, PublicationStatusChip } from "./PublicationStatusChip"
import { PublicationCover } from "./PublicationCover"
import { PublicationReaders } from "./PublicationReaders"
import { formatStorage } from "./format"

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
  step: "storyboard" | "publish"
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
  onStop: () => void
  onResume: () => void
  /** Erasing is the one action that stays available when the book is gone: that row is
   *  unreachable every other way, and clearing it is usually the only thing left to want. */
  onDelete: () => void
  deleting: boolean
  /** Why the last attempt on *this* row failed, if it did. A shelf can run to dozens of rows,
   *  so a single alert under the list is scrolled out of sight by the time it appears — the
   *  answer has to arrive where the button was pressed. */
  deleteError?: Error | null
}

export function PublicationRow({
  publication,
  countsKnown,
  busy,
  index,
  onStop,
  onResume,
  onDelete,
  deleting,
  deleteError = null,
}: PublicationRowProps) {
  const { t, i18n } = useLingui()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [readersOpen, setReadersOpen] = useState(false)
  /** Sticky: the panel stays mounted after the first open so closing can animate, and so a
   *  second look does not re-request a roster the cache already holds. */
  const [readersEverOpened, setReadersEverOpened] = useState(false)

  const url = publication.url
  const { copied, failed: copyFailed, copy } = useCopyLink(url ?? "")
  const state = publicationStateAt(publication)
  const unknown = t`—`

  const titleId = `publication-title-${publication.token}`
  const readersId = `publication-readers-${publication.token}`
  const confirmId = `publication-delete-confirm-panel-${publication.token}`

  const deleteErrorIsStaleWorker = apiErrorCode(deleteError) === "worker_outdated"

  function toggleReaders() {
    setReadersOpen(!readersOpen)
    if (!readersOpen) setReadersEverOpened(true)
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
                onClick={() => void copy()}
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
            step="storyboard"
            disabledHint={t`This book is not on this computer`}
          >
            <MessagesSquare className="size-3.5" aria-hidden="true" />
            <Trans>Comments</Trans>
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
            /** Publishing, not Export. The two were the same page until publishing became its
             *  own stage and Export was cut back to a pointer at it — after which this button
             *  was sending the author to a screen with nothing on it to press. */
            step="publish"
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

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={confirmingDelete}
            aria-controls={confirmId}
            disabled={deleting}
            onClick={() => setConfirmingDelete(!confirmingDelete)}
            className={cn(
              "h-8 justify-start gap-2 text-xs transition-colors duration-200 motion-reduce:transition-none",
              confirmingDelete ? "text-red-700" : "text-muted-foreground hover:text-red-700",
            )}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <Trans>Delete permanently</Trans>
          </Button>

          {/* Grown open rather than swapped in. Replacing the button with the warning made the
              card jump its own height in one frame — the thing you are about to read arrives by
              shoving the page, which is the worst moment for a destructive prompt to feel like a
              misclick. Same collapse the readers drawer uses: `grid-rows` 0fr→1fr is the one
              height transition that needs no measuring, and `transition-discrete` holds
              `visibility` until it finishes, so a shut panel keeps its buttons out of the tab
              order without blinking on the way down. */}
          <div
            id={confirmId}
            aria-hidden={!confirmingDelete}
            className={cn(
              "grid overflow-hidden transition-all duration-300 ease-out transition-discrete motion-reduce:transition-none",
              confirmingDelete ? "grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0">
              <div
                data-testid={`publication-delete-confirm-${publication.book_label}`}
                className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2"
              >
                <p className="text-[11px] leading-4 text-red-900">
                  <Trans>
                    The link stops working and the site, every comment and every reader name are
                    erased. This cannot be undone.
                  </Trans>
                </p>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-7 flex-1 text-xs transition-transform duration-200 active:scale-[0.98] motion-reduce:transition-none"
                    disabled={deleting}
                    onClick={onDelete}
                  >
                    {deleting ? (
                      <Loader2
                        className="size-3.5 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Trans>Delete</Trans>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={deleting}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    <Trans>Cancel</Trans>
                  </Button>
                </div>

                {deleteError ? (
                  <div
                    data-testid={`publication-delete-error-${publication.book_label}`}
                    role="alert"
                    className="flex flex-col items-start gap-1.5 border-t border-red-200 pt-1.5 duration-200 motion-safe:animate-in motion-safe:fade-in-0"
                  >
                    <span className="text-[11px] leading-4 text-red-900">
                      {deleteErrorIsStaleWorker ? (
                        <Trans>
                          Your publishing service is older than this Studio and has no way to
                          erase a book yet. Nothing was deleted. Installing the update adds it.
                        </Trans>
                      ) : (
                        deleteError.message
                      )}
                    </span>
                    {deleteErrorIsStaleWorker ? (
                      <PublishingSettingsLink variant="outline" size="sm" className="h-6 text-xs">
                        <Trans>Install the update</Trans>
                      </PublishingSettingsLink>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* A drawer under the whole card rather than a block inside the text column: it spans the
          divider, and `grid-rows` from 0fr to 1fr is the one height transition that works
          without measuring.
          The drawer is always in the DOM, collapsed — mounting it *and* opening it in the same
          commit gives the browser no start value to interpolate from, which is why a
          mount-on-open version animated shut but never open. `transition-discrete` holds
          `visibility` until the collapse finishes, so closing fades instead of blinking, and a
          shut drawer stays out of the tab order.
          Cost of always rendering it is nothing: `enabled` is what gates the request, so a shelf
          of forty books still fetches no rosters until one is asked for. */}
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
            <PublicationReaders token={publication.token} enabled={readersEverOpened} />
          </div>
        </div>
      </div>
    </li>
  )
}
