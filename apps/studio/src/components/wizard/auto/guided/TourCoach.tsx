import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAssistantName } from "./shared/Assistant"
import { WizardPose, type Pose } from "./shared/WizardPose"
import { Chip } from "./shared/bubbles"
import { useTalk } from "./shared/useTalk"

/** Where the assistant sits around the item: beside it, under it, over it, or in the middle of the page (no item). */
export type Side = "right" | "left" | "below" | "above" | "center"
export type CoachStop = { target: RefObject<HTMLElement | null> | null; side: Side; says: ReactNode; pose?: Pose }

const BUBBLE = 340
const GAP = 18
/** Room around the lit item. */
const PAD = 10
const EDGE = 16

type Rect = { left: number; top: number; width: number; height: number }
type Layout = { side: Side; left: number; top: number; hole: Rect | null }

/** The orb's size beside an item, and the gap between it and the bubble. */
const ORB = 104
const ORB_GAP = 10

/** How far the coach would run past the window's edge on that side (0 when it fits). */
const overflow = (side: Side, t: DOMRect, w: number, h: number) => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (side === "right") return Math.max(0, t.right + GAP + w - (vw - EDGE))
  if (side === "left") return Math.max(0, EDGE - (t.left - GAP - w))
  if (side === "below") return Math.max(0, t.bottom + GAP + h - (vh - EDGE))
  if (side === "above") return Math.max(0, EDGE - (t.top - GAP - h))
  return 0
}

/**
 * The spot for the assistant: its preferred side if there's room there, else the first side that
 * fits, else the side it overflows least. The coach's size on each side comes from the bubble's
 * height alone (the orb beside it, or above it), never from where it stands now, so the choice
 * can't flip back and forth as the coach changes shape.
 */
function layout(stop: CoachStop, bubbleH: number): Layout {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const t = stop.target?.current?.getBoundingClientRect()
  const size = (side: Side) => (side === "right" || side === "left" ? { w: ORB + ORB_GAP + BUBBLE, h: Math.max(ORB, bubbleH) } : { w: BUBBLE, h: ORB + ORB_GAP + bubbleH })
  if (!t || stop.side === "center") {
    const h = 170 + 14 + bubbleH
    return { side: "center", left: (vw - Math.min(BUBBLE + 80, vw - EDGE * 2)) / 2, top: Math.max(EDGE, vh * 0.42 - h / 2), hole: null }
  }
  const order: Side[] = [stop.side, "right", "left", "below", "above"]
  const miss = (s: Side) => overflow(s, t, size(s).w, size(s).h)
  const side = order.find((s) => miss(s) === 0) ?? order.reduce((a, b) => (miss(b) < miss(a) ? b : a))
  const { w, h } = size(side)
  const clampX = (x: number) => Math.max(EDGE, Math.min(vw - w - EDGE, x))
  const clampY = (y: number) => Math.max(EDGE, Math.min(vh - h - EDGE, y))
  const hole = { left: t.left - PAD, top: t.top - PAD, width: t.width + PAD * 2, height: t.height + PAD * 2 }
  if (side === "right") return { side, left: t.right + GAP, top: clampY(t.top + t.height / 2 - h / 2), hole }
  if (side === "left") return { side, left: t.left - GAP - w, top: clampY(t.top + t.height / 2 - h / 2), hole }
  if (side === "below") return { side, left: clampX(t.left + t.width / 2 - w / 2), top: clampY(t.bottom + GAP), hole }
  return { side, left: clampX(t.left + t.width / 2 - w / 2), top: clampY(t.top - GAP - h), hole }
}

/**
 * The first-run tour: the page goes dark except the item the assistant talks about (a lit
 * cut-out that slides from item to item), and the assistant floats beside it, on a side that
 * changes with the item and the room there, its words in a speech bubble pointing back at it.
 * Rendered over the whole window (a portal), so it follows the items as the page scrolls.
 */
export function TourCoach({ stops, at, onNext, onBack, onDone }: { stops: CoachStop[]; at: number; onNext: () => void; onBack: () => void; onDone: () => void }) {
  const name = useAssistantName()
  const stop = stops[at]!
  const last = at === stops.length - 1
  const box = useRef<HTMLDivElement>(null)
  const speech = useRef<HTMLDivElement>(null)
  const talking = useTalk(`tour-${at}`)
  const [pos, setPos] = useState<Layout | null>(null)
  // It glides between stops, but appears in place the first time (no slide in from a corner).
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    if (!pos || placed) return
    const id = requestAnimationFrame(() => setPlaced(true))
    return () => cancelAnimationFrame(id)
  }, [pos, placed])

  const advance = last ? onDone : onNext
  const go = useRef(advance)
  go.current = advance
  const back = useRef(onBack)
  back.current = onBack
  const done = useRef(onDone)
  done.current = onDone

  // Focus comes into the coach for the tour (its main button, at every stop) and goes back to where
  // it was when the tour ends, so keyboard and screen-reader users land on the tour, not behind it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])
  // (Once it is placed: until then the coach is invisible, and can't take focus.)
  const shown = !!pos
  useEffect(() => {
    if (shown) box.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true })
  }, [at, shown])

  // Keys: Enter, Space or → for next, ← for back, Esc to end the tour; Tab stays on the coach's buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        const buttons = [...(box.current?.querySelectorAll<HTMLElement>("button") ?? [])]
        if (!buttons.length) return
        const i = buttons.indexOf(document.activeElement as HTMLElement)
        e.preventDefault()
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]!.focus()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const onControl = !!t?.closest("button, a, input, textarea, select, [contenteditable='true']")
      if (e.key === "ArrowRight" || ((e.key === "Enter" || e.key === " ") && !onControl)) {
        e.preventDefault()
        go.current()
      } else if (e.key === "ArrowLeft" && at > 0) {
        e.preventDefault()
        back.current()
      } else if (e.key === "Escape") done.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [at])

  // The stops are made anew on every render of the page, so the stop is read through a ref: the
  // coach is placed (and its item scrolled into view) once per stop, not on every render.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useLayoutEffect(() => {
    const place = () => {
      const bubble = speech.current
      if (!bubble) return
      setPos(layout(stopRef.current, bubble.offsetHeight))
    }
    stopRef.current.target?.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    place()
    const ro = new ResizeObserver(place)
    if (speech.current) ro.observe(speech.current)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [at])

  const side = pos?.side ?? stop.side
  const big = side === "center"
  const hole = pos?.hole
  return createPortal(
    <div className="lc-root gd-tour" style={{ background: "transparent" }}>
      {/* A click anywhere on the page moves the tour on. */}
      <div aria-hidden className="fixed inset-0 z-[39] cursor-pointer" onClick={() => go.current()} />
      {/* The dark veil, with the lit item cut out of it (a hole whose shadow is the veil). */}
      <div
        aria-hidden
        className="gd-tour-hole"
        style={hole ? { left: hole.left, top: hole.top, width: hole.width, height: hole.height } : { left: "50%", top: "42%", width: 0, height: 0 }}
      />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        data-side={side}
        className={cn("gd-tour-coach fixed z-[41] flex", !pos && "invisible", placed && "gd-tour-glide", side === "right" && "flex-row items-center", side === "left" && "flex-row-reverse items-center", side === "below" && "flex-col items-start", side === "above" && "flex-col-reverse items-start", big && "flex-col items-center")}
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, gap: big ? 14 : 10 }}
      >
        <span className="flex drop-shadow-[0_6px_14px_rgb(43_127_255/0.3)]" style={{ viewTransitionName: "gd-orb" }}>
          <WizardPose pose={stop.pose ?? "hello"} size={big ? 170 : ORB} talking={talking} />
        </span>
        <div key={at} ref={speech} className={cn("gd-speech relative rounded-[22px] bg-[var(--lc-bubble)] px-5 py-4 text-[15.5px] leading-[1.5] lg:text-[16.5px]", big && "text-center")} data-side={side} style={{ width: big ? `min(${BUBBLE + 80}px, calc(100vw - ${EDGE * 2}px))` : BUBBLE }}>
          <span aria-hidden className="gd-speech-tail" />
          <div>
            <p>{stop.says}</p>
            <div className={cn("mt-3.5 flex flex-wrap items-center gap-2", big && "justify-center")}>
              <Chip primary onClick={advance} icon={last ? undefined : <ArrowRight className="size-4" />} className="h-10 flex-row-reverse px-4 text-[14px]">
                {last ? <Trans>Got it</Trans> : at === 0 ? <Trans>Show me</Trans> : <Trans>Next</Trans>}
              </Chip>
              {!last && (
                <button type="button" onClick={onDone} className="inline-flex min-h-10 items-center rounded-full px-2 text-[13.5px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                  <Trans>Skip the tour</Trans>
                </button>
              )}
              <span className={cn("text-[12.5px] tabular-nums text-muted-foreground", !big && "ml-auto")}>
                {at + 1} / {stops.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
