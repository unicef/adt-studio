import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Assistant, useAssistantName } from "./shared/Assistant"
import { useIsWizard, WizardPose, type Pose } from "./shared/WizardPose"
import { Chip } from "./shared/bubbles"
import { useTalk } from "./shared/useTalk"

/** Where the assistant sits around the item: beside it, under it, over it, or in the middle of the page (no item). */
export type Side = "right" | "left" | "below" | "above" | "center"
export type CoachStop = { target: RefObject<HTMLElement | null> | null; side: Side; says: ReactNode; pose?: Pose }

const BUBBLE = 340
const ORB = 56
const GAP = 18
/** Room around the lit item. */
const PAD = 10
const EDGE = 16

type Rect = { left: number; top: number; width: number; height: number }
type Layout = { side: Side; left: number; top: number; hole: Rect | null }

const fits = (side: Side, t: DOMRect, w: number, h: number) => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (side === "right") return t.right + GAP + w <= vw - EDGE
  if (side === "left") return t.left - GAP - w >= EDGE
  if (side === "below") return t.bottom + GAP + h <= vh - EDGE
  if (side === "above") return t.top - GAP - h >= EDGE
  return true
}

/** The spot for the assistant: its preferred side if there's room there, else the first side that fits. */
function layout(stop: CoachStop, w: number, h: number): Layout {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const t = stop.target?.current?.getBoundingClientRect()
  if (!t || stop.side === "center") return { side: "center", left: (vw - w) / 2, top: Math.max(EDGE, vh * 0.42 - h / 2), hole: null }
  const order: Side[] = [stop.side, "right", "left", "below", "above"]
  const side = order.find((s) => s !== "center" && fits(s, t, w, h)) ?? "below"
  const clampX = (x: number) => Math.max(EDGE, Math.min(vw - w - EDGE, x))
  const clampY = (y: number) => Math.max(EDGE, Math.min(vh - h - EDGE, y))
  const hole = { left: t.left - PAD, top: t.top - PAD, width: t.width + PAD * 2, height: t.height + PAD * 2 }
  if (side === "right") return { side, left: t.right + GAP, top: clampY(t.top + t.height / 2 - h / 2), hole }
  if (side === "left") return { side, left: t.left - GAP - w, top: clampY(t.top + t.height / 2 - h / 2), hole }
  if (side === "below") return { side, left: clampX(t.left + t.width / 2 - w / 2), top: t.bottom + GAP, hole }
  return { side, left: clampX(t.left + t.width / 2 - w / 2), top: t.top - GAP - h, hole }
}

/**
 * The first-run tour: the page goes dark except the item the assistant talks about (a lit
 * cut-out that slides from item to item), and the assistant floats beside it, on a side that
 * changes with the item and the room there, its words in a speech bubble pointing back at it.
 * Rendered over the whole window (a portal), so it follows the items as the page scrolls.
 */
export function TourCoach({ stops, at, onNext, onDone }: { stops: CoachStop[]; at: number; onNext: () => void; onDone: () => void }) {
  const name = useAssistantName()
  const wizard = useIsWizard()
  const stop = stops[at]!
  const last = at === stops.length - 1
  const box = useRef<HTMLDivElement>(null)
  const words = useRef<HTMLDivElement>(null)
  const talking = useTalk(words, `tour-${at}`)
  const [pos, setPos] = useState<Layout | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const me = box.current
      if (!me) return
      setPos(layout(stop, me.offsetWidth, me.offsetHeight))
    }
    stop.target?.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    place()
    const ro = new ResizeObserver(place)
    if (box.current) ro.observe(box.current)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [at, stop])

  const side = pos?.side ?? stop.side
  const big = side === "center"
  const hole = pos?.hole
  return createPortal(
    <div className="lc-root gd-tour" style={{ background: "transparent" }}>
      {/* The dark veil, with the lit item cut out of it (a hole whose shadow is the veil). */}
      <div
        aria-hidden
        className="gd-tour-hole"
        style={hole ? { left: hole.left, top: hole.top, width: hole.width, height: hole.height } : { left: "50%", top: "42%", width: 0, height: 0 }}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="false"
        aria-label={name}
        data-side={side}
        className={cn("gd-tour-coach fixed z-[61] flex", !pos && "invisible", side === "right" && "flex-row items-center", side === "left" && "flex-row-reverse items-center", side === "below" && "flex-col items-start", side === "above" && "flex-col-reverse items-start", big && "flex-col items-center")}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, gap: big ? 14 : 10 }}
      >
        <span className="gd-tour-orb flex" style={{ viewTransitionName: "gd-orb" }}>
          {wizard ? <WizardPose pose={stop.pose ?? "hello"} size={big ? 170 : 104} talking={talking} /> : <Assistant mood={talking ? "talking" : "idle"} size={big ? 76 : ORB} />}
        </span>
        <div key={at} className={cn("gd-speech relative rounded-[22px] bg-[var(--lc-bubble)] px-5 py-4 text-[15.5px] leading-[1.5] lg:text-[16.5px]", big && "text-center")} data-side={side} style={{ width: big ? BUBBLE + 80 : BUBBLE }}>
          <span aria-hidden className="gd-speech-tail" />
          <div ref={words} className="gd-say">
            <p>{stop.says}</p>
            <div className={cn("mt-3.5 flex flex-wrap items-center gap-2", big && "justify-center")}>
              <Chip primary onClick={last ? onDone : onNext} icon={last ? undefined : <ArrowRight className="size-4" />} className="h-10 flex-row-reverse px-4 text-[14px]">
                {last ? <Trans>Got it</Trans> : at === 0 ? <Trans>Show me</Trans> : <Trans>Next</Trans>}
              </Chip>
              {!last && (
                <button type="button" onClick={onDone} className="inline-flex min-h-10 items-center rounded-full px-2 text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                  <Trans>Skip the tour</Trans>
                </button>
              )}
              {!big && (
                <span className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
                  {at + 1} / {stops.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
