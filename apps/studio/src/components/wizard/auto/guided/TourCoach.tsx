import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Assistant } from "./shared/Assistant"
import { Chip } from "./shared/bubbles"
import { useTalk } from "./shared/useTalk"

const WIDTH = 380
const GAP = 14

export type CoachStop = { target: RefObject<HTMLElement | null> | null; place: "below" | "above" | "over"; says: ReactNode }

/**
 * The first-run tour's assistant, floating next to what it talks about (like a guided tour): the
 * orb, what it says, and Next / Skip, with a small pointer at the item. It glides from item to item;
 * the page under it doesn't move. `stops[at]` names the item and on which side to sit.
 */
export function TourCoach({ stops, at, area, onNext, onDone }: { stops: CoachStop[]; at: number; area: RefObject<HTMLElement | null>; onNext: () => void; onDone: () => void }) {
  const { t } = useLingui()
  const stop = stops[at]!
  const last = at === stops.length - 1
  const box = useRef<HTMLDivElement>(null)
  const words = useRef<HTMLDivElement>(null)
  const talking = useTalk(words, `tour-${at}`)
  const [pos, setPos] = useState<{ left: number; top: number; pointer: number; side: "up" | "down" | null; width: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const root = area.current
      const me = box.current
      if (!root || !me) return
      const r = root.getBoundingClientRect()
      const width = Math.min(WIDTH, r.width)
      const h = me.offsetHeight
      const t = stop.target?.current?.getBoundingClientRect()
      if (!t) return setPos({ left: (r.width - width) / 2, top: 8, pointer: width / 2, side: null, width })
      const cx = t.left - r.left + t.width / 2
      const left = Math.max(0, Math.min(r.width - width, cx - width / 2))
      const top = stop.place === "below" ? t.bottom - r.top + GAP : stop.place === "above" ? t.top - r.top - h - GAP : t.top - r.top + Math.max(GAP, (t.height - h) / 2)
      setPos({ left, top, pointer: Math.max(24, Math.min(width - 24, cx - left)), side: stop.place === "below" ? "up" : stop.place === "above" ? "down" : null, width })
    }
    place()
    const ro = new ResizeObserver(place)
    if (area.current) ro.observe(area.current)
    if (box.current) ro.observe(box.current)
    window.addEventListener("resize", place)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", place)
    }
  }, [at, stop])

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-label={t`ADT Assistant`}
      className={cn("gd-coach absolute z-20 flex items-start gap-3", !pos && "invisible")}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width ?? WIDTH }}
    >
      <span className="mt-1 flex" style={{ viewTransitionName: "gd-orb" }}>
        <Assistant mood={talking ? "talking" : "idle"} size={44} />
      </span>
      <div className="relative min-w-0 flex-1 rounded-[18px] bg-[var(--lc-bubble)] px-4 py-3.5 text-[15px] leading-[1.5] shadow-[0_18px_44px_-14px_rgba(15,23,42,0.35)] ring-1 ring-[var(--lc-line)] lg:text-[16px]">
        {pos?.side && <span aria-hidden className={cn("gd-coach-pointer", pos.side === "up" ? "-top-[7px]" : "-bottom-[7px]")} style={{ left: Math.max(14, pos.pointer - 56 - 7) }} />}
        <div ref={words} key={at} className="gd-say">
          <p>{stop.says}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip primary onClick={last ? onDone : onNext} icon={last ? undefined : <ArrowRight className="size-4" />} className="h-10 flex-row-reverse px-4 text-[14px]">
              {last ? <Trans>Got it</Trans> : at === 0 ? <Trans>Show me</Trans> : <Trans>Next</Trans>}
            </Chip>
            {!last && (
              <button type="button" onClick={onDone} className="inline-flex min-h-10 items-center rounded-full px-2 text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                <Trans>Skip the tour</Trans>
              </button>
            )}
            <span className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
              {at + 1} / {stops.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
