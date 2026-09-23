import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowUpCircle, BookOpen, CheckCircle2, Loader2, Settings2 } from "lucide-react"
import { getBookCoverUrl } from "@/api/client"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DashLink } from "./dashboard-data"
import { SharingHandout } from "./SharingHandout"
import { heroNotice } from "./helpers"

/**
 * The top of the dashboard: what is out there and how to hand it over, in one card. The left half
 * answers "is it live, which version, is it current, when does it end"; the right half is the
 * hand-out. Anything that needs the author spans the bottom edge, so it can't be missed.
 */
export function SharingHero({ link, onOpenSettings }: { link: DashLink; onOpenSettings: () => void }) {
  const band = heroNotice(link)
  return (
    <section
      aria-label={link.title}
      className="shrink-0 overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <HeroIdentity link={link} onOpenSettings={onOpenSettings} quiet={band !== null} />
        <div className="border-l bg-muted/30 px-6 py-5 [@media(max-height:820px)]:py-4">
          <SharingHandout link={link} />
        </div>
      </div>
      <HeroNoticeRow link={link} />
    </section>
  )
}

function HeroIdentity({ link, onOpenSettings, quiet }: { link: DashLink; onOpenSettings: () => void; quiet: boolean }) {
  const { t } = useLingui()
  const [coverFailed, setCoverFailed] = useState(false)

  return (
    <div className="flex min-w-0 items-start gap-5 px-6 py-5 [@media(max-height:820px)]:py-4">
      <div className="relative h-[92px] w-[70px] shrink-0 overflow-hidden rounded-md bg-muted shadow-[0_1px_2px_rgba(15,23,42,0.08),0_6px_16px_-6px_rgba(15,23,42,0.25)] ring-1 ring-black/5 dark:ring-white/10">
        {coverFailed ? (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <BookOpen className="size-6" aria-hidden="true" />
          </span>
        ) : (
          <img
            src={getBookCoverUrl(link.bookLabel)}
            alt=""
            className="size-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <LivePill reachable={link.workerReachable} />
          <button
            type="button"
            onClick={onOpenSettings}
            title={t`Link settings`}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            <Trans>Link settings</Trans>
          </button>
        </div>
        <h2 className="truncate text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
          {link.title}
        </h2>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {link.liveVersion !== null ? (
            <span className="font-semibold tabular-nums text-foreground">
              <Trans>Version {link.liveVersion}</Trans>
            </span>
          ) : null}
          {link.updatedAt !== null ? (
            <>
              <span aria-hidden="true" className="text-border">
                •
              </span>
              <span>
                <Trans>
                  Updated <RelativeTime iso={link.updatedAt} />
                </Trans>
              </span>
            </>
          ) : null}
        </p>

        {!link.workerReachable && link.changesWaiting === true ? (
          <p className="flex items-center gap-1.5 text-[13px] text-amber-700 motion-safe:animate-in motion-safe:fade-in-0 dark:text-amber-300">
            <ArrowUpCircle className="size-4 shrink-0" aria-hidden="true" />
            <Trans>You've edited since this version — update once the service is back.</Trans>
          </p>
        ) : quiet ? null : link.changesWaiting === false ? (
          <p className="flex items-center gap-1.5 text-[13px] text-emerald-700 motion-safe:animate-in motion-safe:fade-in-0 dark:text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <Trans>Up to date — readers see your latest edits.</Trans>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function LivePill({ reachable }: { reachable: boolean }) {
  if (!reachable) {
    return (
      <span className="flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        <Trans>Not answering</Trans>
      </span>
    )
  }
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
      <span className="relative flex size-1.5" aria-hidden="true">
        <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      <Trans>Live</Trans>
    </span>
  )
}

function HeroNoticeRow({ link }: { link: DashLink }) {
  const band = heroNotice(link)
  if (band === null) return null

  if (band === "down") {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 border-t border-amber-200 bg-amber-50 px-6 py-2.5 text-[13px] text-amber-900 motion-safe:animate-in motion-safe:fade-in-0 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span>
          <Trans>
            <span className="font-semibold">The sharing service isn't answering.</span> Readers may not reach the
            link, and new feedback shows up once it's back.
          </Trans>
        </span>
      </div>
    )
  }

  if (band === "updating") {
    return (
      <div
        role="status"
        className="flex items-center gap-2.5 border-t border-brand-100 bg-brand-50 px-6 py-3 text-[13px] text-brand-800 motion-safe:animate-in motion-safe:fade-in-0 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100"
      >
        <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Trans>Updating the link — readers get your latest edits in a moment, on the same address.</Trans>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-amber-200 bg-amber-50 px-6 py-2.5 text-amber-900 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
        "dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
        <ArrowUpCircle className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="text-[13px] font-semibold">
          <Trans>Readers don't see your latest edits</Trans>
        </span>
        <span className="text-xs text-amber-800/80 dark:text-amber-100/70">
          <Trans>Update the link to send them — same address, same code.</Trans>
        </span>
      </span>
      <Button
        size="sm"
        className="h-9 shrink-0 bg-amber-600 px-4 text-white shadow-sm hover:bg-amber-700"
        onClick={link.update}
      >
        <ArrowUpCircle aria-hidden="true" />
        <Trans>Update link</Trans>
      </Button>
    </div>
  )
}
