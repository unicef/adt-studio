import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, CheckCircle2, CloudOff } from "lucide-react"
import { getBookCoverUrl } from "@/api/client"
import { ShareLink } from "@/components/pipeline/stages/export/publish/ShareLink"
import { formatPublishDate } from "@/components/pipeline/stages/export/publish/expiry-options"

interface PublishingHeroProps {
  bookLabel: string
  title: string
  url: string
  currentVersion: number | null
  lastPublishedAt: string | null
  workerReachable: boolean
}

/**
 * The top of the dashboard: this book, and the address it lives at.
 *
 * The cover is the point. Every other screen in the Studio shows the book being worked on, and a
 * publishing screen that showed only a URL made the author confirm by reading a token which book
 * they were about to overwrite. A thumbnail answers that before it is asked.
 *
 * The live dot pulses only while the service is answering — a badge that pulses whatever the
 * state would be decoration, and the one thing this row must never do is look healthy when it
 * is not.
 */
export function PublishingHero({
  bookLabel,
  title,
  url,
  currentVersion,
  lastPublishedAt,
  workerReachable,
}: PublishingHeroProps) {
  const { i18n, t } = useLingui()
  const [coverFailed, setCoverFailed] = useState(false)

  return (
    <div className="flex shrink-0 flex-col gap-4 rounded-2xl border bg-gradient-to-br from-indigo-50/80 via-card to-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-[76px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted shadow-sm">
          {coverFailed ? (
            <BookOpen className="size-5 text-muted-foreground/70" aria-hidden="true" />
          ) : (
            <img
              src={getBookCoverUrl(bookLabel)}
              alt={t`Cover of ${title}`}
              loading="lazy"
              decoding="async"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover object-top"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            {workerReachable ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <span className="relative flex size-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 motion-safe:animate-ping" />
                  <span className="relative size-1.5 rounded-full bg-emerald-500" />
                </span>
                <Trans>Live</Trans>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                <CloudOff className="size-3" aria-hidden="true" />
                <Trans>Service not answering</Trans>
              </span>
            )}
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {currentVersion === null ? null : <Trans>Version {currentVersion}</Trans>}
              {lastPublishedAt ? (
                <>
                  {" · "}
                  <Trans>updated {formatPublishDate(lastPublishedAt, i18n.locale)}</Trans>
                </>
              ) : null}
            </span>
          </span>

          <h2 className="truncate text-lg font-semibold leading-snug tracking-tight text-foreground">
            {title}
          </h2>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <Trans>Anyone with the link below can read this copy.</Trans>
          </p>
        </div>
      </div>

      <ShareLink url={url} highlight />
    </div>
  )
}
