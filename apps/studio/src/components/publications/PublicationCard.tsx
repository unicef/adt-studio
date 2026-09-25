import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  Copy,
  ExternalLink,
  HardDrive,
  History,
  KeyRound,
  Link2Off,
  MessagesSquare,
  MoreHorizontal,
  Radio,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react"
import { publicationStateAt, type PublicationState, type PublicationSummary } from "@adt/types"
import { apiErrorCode, getBookCoverUrl } from "@/api/client"
import { ActionMenu, type ActionMenuEntry } from "@/components/ui/action-menu"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { formatStorage } from "./format"
import { PublicationReadersDialog } from "./PublicationReadersDialog"
import { PublishingSettingsLink } from "@/components/pipeline/stages/publish/PublishingSettingsLink"

/** Status reads as a pill on the cover, dot plus word — never colour alone. */
const STATE_DOT: Record<PublicationState, string> = {
  active: "bg-emerald-500",
  revoked: "bg-muted-foreground/60",
  expired: "bg-amber-500",
}

export interface PublicationCardProps {
  publication: PublicationSummary
  /** `false` while the worker is unreachable: sizes and comment counts are unmeasured, so the
   *  card shows a dash rather than a number nobody counted. */
  countsKnown: boolean
  index: number
  busy: boolean
  deleting: boolean
  onStop: () => void
  onResume: () => void
  onDelete: () => void
  /** Deleting reports itself on the card that failed: a shelf runs long enough that an alert
   *  anywhere else is off screen by the time it appears. */
  deleteError?: Error | null
}

/**
 * One shared book.
 *
 * The cover sits whole on a padded stage rather than cropped to a rectangle, because a teacher
 * recognises the book long before they read the title. Everything else is an icon and a number:
 * status and the count of comments waiting are chips on the stage, storage and versions are
 * badges, and the rest of the actions live behind one menu.
 */
export function PublicationCard({
  publication,
  countsKnown,
  index,
  busy,
  deleting,
  onStop,
  onResume,
  onDelete,
  deleteError = null,
}: PublicationCardProps) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const [readersOpen, setReadersOpen] = useState(false)

  const state = publicationStateAt(publication)
  const staleWorker = apiErrorCode(deleteError) === "worker_outdated"
  const here = publication.book_exists
  const showCover = here && !failed
  const waiting = countsKnown && publication.unresolved_count > 0
  const label = here
    ? state === "active"
      ? t`Live`
      : state === "revoked"
        ? t`Stopped`
        : t`Expired`
    : t`Missing`

  /** `navigator.clipboard` rejects on an insecure origin and in an unfocused window, and a
   *  button that silently does nothing there teaches the author that sharing is broken. */
  const copyToClipboard = async (text: string, done: string, failed: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(done)
    } catch {
      toast.error(failed)
    }
  }

  const items: ActionMenuEntry[] = [
    {
      icon: MessagesSquare,
      label:
        countsKnown && publication.unresolved_count > 0
          ? t`Comments (${publication.unresolved_count > 99 ? "99+" : publication.unresolved_count})`
          : t`Comments`,
      onClick: () =>
        void navigate({
          to: "/books/$label/$step",
          params: { label: publication.book_label, step: "storyboard" },
        }),
      disabled: !here,
    },
    {
      icon: RefreshCw,
      label: t`Update site`,
      /** Publishing, not Export: Export was cut back to a pointer at the publish stage, so
       *  sending an author there lands them on a screen with nothing to press. */
      onClick: () =>
        void navigate({
          to: "/books/$label/$step",
          params: { label: publication.book_label, step: "publish" },
        }),
      disabled: !here,
    },
    { icon: Users, label: t`Readers`, onClick: () => setReadersOpen(true) },
    {
      icon: KeyRound,
      /** The code is the label: readable on demand for the teacher reading it to a class, and
       *  off the card face for whoever is standing behind them. */
      label: publication.access_code
        ? t`Copy code ${publication.access_code}`
        : t`Copy access code`,
      onClick: () =>
        void copyToClipboard(
          publication.access_code ?? "",
          t`Access code copied to the clipboard`,
          t`Couldn't copy the access code.`,
        ),
      hidden: !publication.has_access_code || !publication.access_code,
    },
    { separator: true },
    {
      icon: state === "revoked" ? Radio : Link2Off,
      label: state === "revoked" ? t`Resume sharing` : t`Stop sharing`,
      onClick: state === "revoked" ? onResume : onStop,
      disabled: busy,
    },
    { separator: true },
    { icon: Trash2, label: t`Delete permanently`, onClick: onDelete, danger: true },
  ]

  return (
    <li
      data-testid={`publication-card-${publication.book_label}`}
      data-state={state}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms`, animationFillMode: "both" }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card",
        "transition-[box-shadow,opacity] duration-200 hover:shadow-md motion-reduce:transition-none",
        "has-[a[data-card-link]:focus-visible]:ring-2 has-[a[data-card-link]:focus-visible]:ring-ring",
        "motion-safe:animate-wizard-enter",
        deleting && "pointer-events-none opacity-50",
      )}
    >
      <div className="relative flex h-56 w-full items-center justify-center bg-muted/40 px-4 pb-4 pt-11">
        {showCover ? (
          <img
            src={getBookCoverUrl(publication.book_label)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={cn(
              "h-full w-auto rounded-md object-contain shadow-md",
              "transition-[filter,opacity] duration-500 motion-reduce:transition-none",
              state === "revoked" && "opacity-70 grayscale",
            )}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-[105px] items-center justify-center rounded-md border border-dashed bg-card text-xl font-semibold text-muted-foreground/40"
          >
            {publication.title.slice(0, 2).toUpperCase()}
          </span>
        )}

        {/* The chips share the band above the cover, so neither ever sits on the artwork. */}
        <span className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full bg-card px-2 py-1 text-[11px] font-medium text-foreground shadow-sm">
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", here ? STATE_DOT[state] : "bg-destructive")}
            />
            {label}
          </span>
          {publication.has_access_code && (
            <span className="flex size-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
              <KeyRound className="size-3" aria-hidden="true" />
              <span className="sr-only">{t`Readers need an access code`}</span>
            </span>
          )}
        </span>

        {waiting && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold tabular-nums text-primary-foreground shadow-sm">
            <MessagesSquare className="size-3" aria-hidden="true" />
            {publication.unresolved_count > 99 ? t`99+` : publication.unresolved_count}
            <span className="sr-only">{t`comments waiting for you`}</span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-8 text-[13px] font-medium leading-4 text-foreground">
          {here ? (
            /* Stretched over the whole card, so the cover and the title open the book's Sharing
               page; the footer's own buttons sit above it and keep working. */
            <Link
              to="/books/$label/$step"
              params={{ label: publication.book_label, step: "publish" }}
              data-card-link=""
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {publication.title}
            </Link>
          ) : (
            publication.title
          )}
        </h3>
        {here ? null : (
          /** The link still works; the book behind it is gone from this machine. Saying so on
           *  the card matters — every local action below is disabled because of it. */
          <p className="text-[11px] leading-4 text-destructive">
            <Trans>Book no longer on this computer</Trans>
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5">
          <Badge icon={HardDrive} label={t`Storage used`}>
            {countsKnown && publication.snapshot_bytes !== null
              ? formatStorage(publication.snapshot_bytes, i18n.locale)
              : t`—`}
          </Badge>
          {/* The number is the version readers are being served, not how many exist: a shelf
              that reads "v3" next to three versions is right by accident. */}
          <Badge
            icon={History}
            label={t`Now serving version ${publication.current_version} of ${publication.version_count}`}
          >
            <Trans>v{publication.current_version}</Trans>
          </Badge>

          <span className="relative z-10 ml-auto flex shrink-0 items-center">
            {state === "active" && publication.url && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void copyToClipboard(
                      publication.url ?? "",
                      t`Link copied to the clipboard`,
                      t`Couldn't copy the link — open the book's Sharing step and copy it there.`,
                    )
                  }
                  aria-label={t`Copy the link to ${publication.title}`}
                  className="size-7 p-0 text-muted-foreground/70 transition-colors duration-200 hover:text-foreground motion-reduce:transition-none"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  asChild
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 text-muted-foreground/70 transition-colors duration-200 hover:text-foreground motion-reduce:transition-none"
                >
                  <a
                    href={publication.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t`Open ${publication.title}`}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </Button>
              </>
            )}

            <ActionMenu
              trigger={<MoreHorizontal className="size-3.5" aria-hidden="true" />}
              triggerAriaLabel={t`More actions for ${publication.title}`}
              triggerClassName="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground motion-reduce:transition-none"
              note={
                here ? undefined : (
                  <p className="px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
                    <Trans>This book is not on this computer.</Trans>
                  </p>
                )
              }
              items={items}
            />
          </span>
        </div>
      </div>

      {deleteError ? (
        <div
          data-testid={`publication-delete-error-${publication.book_label}`}
          role="alert"
          className="relative z-10 flex flex-wrap items-center gap-2 border-t border-destructive/30 px-3 py-2 duration-200 motion-safe:animate-in motion-safe:fade-in-0 motion-reduce:animate-none"
        >
          <span className="min-w-0 flex-1 text-[11px] leading-4 text-red-900 dark:text-red-200">
            {staleWorker ? (
              <Trans>
                Your sharing service is older than this Studio and has no way to erase a book
                yet. Nothing was deleted. Installing the update adds it.
              </Trans>
            ) : (
              deleteError.message
            )}
          </span>
          {staleWorker ? (
            <PublishingSettingsLink variant="outline" size="sm" className="h-7 text-xs">
              <Trans>Install the update</Trans>
            </PublishingSettingsLink>
          ) : null}
        </div>
      ) : null}

      <PublicationReadersDialog
        token={publication.token}
        title={publication.title}
        open={readersOpen}
        onOpenChange={setReadersOpen}
      />
    </li>
  )
}

function Badge({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof History
  label: string
  children: React.ReactNode
}) {
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
      <Icon className="size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      {children}
      <span className="sr-only">{label}</span>
    </span>
  )
}
