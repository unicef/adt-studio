import { useEffect, useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { CloudOff, TimerReset } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatPublishDate, formatPublishDateTime } from "../expiry-options"
import type { DashLink } from "./dashboard-data"
import { DashboardPanel } from "./DashboardPanel"

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
/** Inside this window the end date stops being a fact and becomes a warning. */
const SOON_MS = 7 * DAY_MS

export type ExpiryTone = "none" | "far" | "soon" | "urgent" | "ended"

export interface ExpiryState {
  tone: ExpiryTone
  endsAt: string | null
  remainingMs: number
  /** Whole hours left, for the last day. */
  hours: number
  /** Whole days left, rounded up. */
  days: number
}

export function expiryState(link: DashLink, now: number = Date.now()): ExpiryState {
  const end = link.expiresAt === null ? Number.NaN : Date.parse(link.expiresAt)
  if (link.expiresAt === null || !Number.isFinite(end)) return { tone: "none", endsAt: null, remainingMs: Infinity, hours: 0, days: 0 }
  const remainingMs = Math.max(0, end - now)
  const tone: ExpiryTone =
    remainingMs === 0 ? "ended" : remainingMs <= DAY_MS ? "urgent" : remainingMs <= SOON_MS ? "soon" : "far"
  return {
    tone,
    endsAt: link.expiresAt,
    remainingMs,
    hours: Math.max(1, Math.ceil(remainingMs / HOUR_MS)),
    days: Math.max(1, Math.ceil(remainingMs / DAY_MS)),
  }
}

/**
 * The countdown as an overview widget, the lower half of the right column. It is framed like
 * every other panel on the dashboard; only the number and the bar take on the urgency, so the page
 * stays calm while the fact that matters still reads first.
 */
export function LinkAccessWidget({ link, startedAt, onExtend }: { link: DashLink; startedAt: string | null; onExtend: () => void }) {
  const { i18n, t } = useLingui()
  useMinuteTick()
  /** Read fresh on every render, not from the tick: after the end date changes, a clock up to a
   *  minute old would count a 30-day link as 30 days and some seconds — "31 days". */
  const now = Date.now()
  const state = expiryState(link, now)
  const start = startedAt ? Date.parse(startedAt) : Number.NaN
  const end = state.endsAt ? Date.parse(state.endsAt) : Number.NaN
  const elapsed = Number.isFinite(start) && Number.isFinite(end) ? Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start))) : 0
  const numberTone =
    state.tone === "urgent" || state.tone === "ended"
      ? "text-rose-700 dark:text-rose-300"
      : state.tone === "soon"
        ? "text-amber-700 dark:text-amber-300"
        : "text-foreground"

  const offline = !link.workerReachable
  const extend = (
    <Button
      size="sm"
      variant="outline"
      className="h-8 shrink-0"
      disabled={offline}
      title={offline ? t`The end date can be changed once the sharing service answers` : undefined}
      onClick={onExtend}
    >
      <TimerReset aria-hidden="true" />
      {state.tone === "none" ? <Trans>Add an end date</Trans> : <Trans>Extend</Trans>}
    </Button>
  )

  return (
    <DashboardPanel title={<Trans>Link access</Trans>}>
      <div className="flex min-h-full flex-col justify-center gap-3 px-5 py-4 [@media(max-height:820px)]:gap-2 [@media(max-height:820px)]:py-2.5">
        {state.tone === "ended" ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <span className="text-2xl font-semibold leading-none tracking-tight text-rose-700 dark:text-rose-300">
                <Trans>Ended</Trans>
              </span>
              {extend}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              <Trans>Readers lost access {formatPublishDateTime(state.endsAt as string, i18n.locale)}.</Trans>
            </p>
          </>
        ) : state.endsAt === null ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <span className="text-2xl font-semibold leading-none tracking-tight text-foreground">
                <Trans>No end date</Trans>
              </span>
              {extend}
            </div>
            {offline ? (
              <OfflineNote />
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                <Trans>The link stays open until you stop sharing. Add an end date if readers only need it for a while.</Trans>
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <span className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground [@media(max-height:820px)]:hidden">
                  <Trans>Ends in</Trans>
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-5xl font-semibold leading-none tabular-nums tracking-tight transition-colors duration-300 motion-reduce:transition-none [@media(max-height:820px)]:text-3xl",
                      numberTone,
                    )}
                  >
                    {state.tone === "urgent" ? state.hours : state.days}
                  </span>
                  <span className={cn("text-base font-medium", numberTone)}>
                    {state.tone === "urgent" ? (
                      <Plural value={state.hours} one="hour" other="hours" />
                    ) : (
                      <Plural value={state.days} one="day" other="days" />
                    )}
                  </span>
                </span>
              </span>
              {extend}
            </div>
            <div
              role="progressbar"
              aria-label={t`Time the link has been open`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(elapsed * 100)}
              className="relative h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none",
                  state.tone === "urgent" ? "bg-rose-500" : state.tone === "soon" ? "bg-amber-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.max(3, elapsed * 100)}%` }}
              />
            </div>
            {offline ? (
              <OfflineNote />
            ) : (
            <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
              {startedAt ? (
                <span>
                  <Trans>Shared {formatPublishDate(startedAt, i18n.locale)}</Trans>
                </span>
              ) : null}
              <span>
                <Trans>Readers lose access {formatPublishDateTime(state.endsAt, i18n.locale)}</Trans>
              </span>
            </p>
            )}
          </>
        )}
      </div>
    </DashboardPanel>
  )
}

/** Re-renders once a minute, so a countdown moves while the page stays open. */
function useMinuteTick(intervalMs = 60_000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
}

/** While the service is down the date shown is the last one this machine knows, and it can't be
 *  changed — both said plainly, in place of the usual detail line. */
function OfflineNote() {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
      <CloudOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <Trans>The last date this computer knows. It can be changed once the service is back.</Trans>
    </p>
  )
}
