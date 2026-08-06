import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Check, CloudOff, Copy } from "lucide-react"
import { getBookCoverUrl } from "@/api/client"
import { Button } from "@/components/ui/button"
import { ExternalLinkButton } from "@/components/settings/publishing/ExternalLinkButton"
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
 *
 * The address itself is not printed here. It used to be, in a box of its own, until the
 * invitation block below started showing the whole message it goes into — and a 70-character URL
 * on screen twice is worse than a pair of buttons that do something with it.
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
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  async function copyLink() {
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
    timerRef.current = setTimeout(() => setCopied(false), 2500)
  }

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

          <span className="mt-1 flex flex-wrap items-center gap-2">
            <Button
              data-testid="publish-share-copy"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void copyLink()}
            >
              {copied ? (
                <Check
                  className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
                  aria-hidden="true"
                />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copied ? <Trans>Link copied</Trans> : <Trans>Copy link</Trans>}
            </Button>
            {/* No icon of its own: `ExternalLinkButton` draws the arrow itself, and passing one
                in put two on the button. */}
            <ExternalLinkButton href={url} variant="outline" size="sm" className="h-8 text-xs">
              <Trans>Open</Trans>
            </ExternalLinkButton>
          </span>
        </div>
      </div>
    </div>
  )
}
