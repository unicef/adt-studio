import { useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { AiCursor, MOVE_MS, type CursorNote } from "./cursors"

type Side = "left" | "right"
type Stop = { x: number; y: number; comment: boolean }
type Slot = "left" | "right" | "single"

const DWELL_MS = 380
const TURN_MS = 950
const NOTE_ROOM = 2 * (228 + 20 + 28)
const COVER = 12
const STACK = 5

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return size
}

/** Where the AI's reading lens pauses on a page: 1–3 stops; the last one is where it comments. */
function makeScript(): Stop[] {
  const count = Math.random() < 0.3 ? 1 : Math.random() < 0.6 ? 2 : 3
  return Array.from({ length: count }, (_, i) => ({ x: Math.round(rand(24, 76)), y: Math.round(rand(16 + i * 18, 34 + i * 20)), comment: i === count - 1 }))
}

/** Generic notes while the AI "reads" — we don't know the book's content, so nothing specific. */
export function useComments(): string[] {
  const { t } = useLingui()
  return useMemo(
    () => [
      t`Taking a closer look at this page…`,
      t`Noting how the text and images sit together`,
      t`Making a note for later ✍️`,
      t`Checking how this page is laid out`,
      t`This helps me choose a layout`,
      t`Comparing this with our book presets`,
      t`Got it — on to the next one`,
      t`Keeping track of what I see`,
    ],
    [t],
  )
}

/** One sheet of paper: the page image, paper grain, and the curve/shade toward the binding. */
function Paper({ src, binding }: { src?: string; binding: Side }) {
  return (
    <div className="am-paper relative size-full overflow-hidden">
      {src ? (
        <img src={src} alt="" className="size-full object-cover mix-blend-multiply" />
      ) : (
        <div className="flex size-full flex-col gap-[5%] p-[12%]">
          {[70, 90, 80, 60, 85, 75].map((w, i) => (
            <span key={i} className="h-[3%] rounded-full bg-stone-200 motion-safe:animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 w-[30%]", binding === "right" ? "right-0 bg-[linear-gradient(to_left,rgba(60,45,20,0.38),rgba(60,45,20,0.12)_22%,rgba(255,255,255,0.22)_48%,transparent_85%)]" : "left-0 bg-[linear-gradient(to_right,rgba(60,45,20,0.38),rgba(60,45,20,0.12)_22%,rgba(255,255,255,0.22)_48%,transparent_85%)]")} />
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 w-[6%]", binding === "right" ? "left-0 bg-gradient-to-r from-black/[0.06] to-transparent" : "right-0 bg-gradient-to-l from-black/[0.06] to-transparent")} />
    </div>
  )
}

/** The page edges under a page: thin cream layers peeking out on the free side and along the bottom. */
function Stack({ free }: { free: Side }) {
  return (
    <>
      {Array.from({ length: STACK }, (_, i) => STACK - i).map((i) => (
        <div
          key={i}
          aria-hidden
          className="absolute rounded-[2px] bg-[#f1ebdd] shadow-[0_0.5px_0_rgba(120,95,55,0.45)]"
          style={{ top: i * 0.4, bottom: -i * 1.2, left: free === "left" ? -i * 1.2 : 0, right: free === "right" ? -i * 1.2 : 0 }}
        />
      ))}
    </>
  )
}

/**
 * A realistic book built from the real PDF pages, in order. Portrait/square books open flat as a
 * two-page spread; landscape books show one page at a time, bound on the left. Depth comes from
 * paper curvature, page stacks, gutter shading and an even hard cover — no heavy 3D tilt.
 * The AI cursor glides to a few spots per page; at its last stop its name tag grows into a comment
 * and the book waits for it before the next page (or page turn).
 */
export function RealBook({ pages, numPages, aspect, first, comments, stopped, failed }: { pages: Record<number, string>; numPages: number; aspect: number; first: number; comments: string[]; stopped?: boolean; failed?: boolean }) {
  const single = aspect > 1.05
  const perView = single ? 1 : 2
  const views = useMemo(() => {
    const out: (string | undefined)[][] = []
    for (let n = first; n + perView - 1 <= numPages; n += perView) {
      if (!pages[n] && out.length) break
      out.push(single ? [pages[n]] : [pages[n], pages[n + 1]])
    }
    return out.length ? out : [single ? [undefined] : [undefined, undefined]]
  }, [pages, numPages, first, single, perView])

  const [index, setIndex] = useState(0)
  const [slot, setSlot] = useState<Slot | "turn">(single ? "single" : "left")
  const [script, setScript] = useState<Stop[]>(makeScript)
  const [step, setStep] = useState(0)
  const [note, setNote] = useState<CursorNote | null>(null)
  const counter = useRef(0)
  const active = !stopped && !failed
  const view = views[index % views.length]
  const next = views[(index + 1) % views.length]
  const turning = active && slot === "turn" && views.length > 1
  const stop = script[Math.min(step, script.length - 1)]

  useEffect(() => {
    setIndex(0)
    setStep(0)
    setNote(null)
    setSlot(single ? "single" : "left")
  }, [single])

  const advance = () => {
    setStep(0)
    setScript(makeScript())
    setSlot((s) => (s === "left" ? "right" : views.length > 1 ? "turn" : single ? "single" : "left"))
  }

  useEffect(() => {
    if (!active || slot === "turn" || note) return
    const id = window.setTimeout(() => {
      if (!stop.comment) return setStep((s) => s + 1)
      counter.current += 1
      setNote({ id: counter.current, text: comments[Math.floor(Math.random() * comments.length)] })
    }, MOVE_MS + DWELL_MS)
    return () => window.clearTimeout(id)
  }, [active, slot, step, note, stop, comments])

  useEffect(() => {
    if (!active || slot !== "turn") return
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % views.length)
      setSlot(single ? "single" : "left")
    }, TURN_MS)
    return () => window.clearTimeout(id)
  }, [active, slot, views.length, single])

  const viewport = useViewport()
  const maxW = Math.max(420, Math.min(840, viewport.w - NOTE_ROOM - 40))
  const maxH = Math.max(260, Math.min(430, viewport.h * 0.44))
  const pageH = Math.round(Math.min(maxH, single ? maxW / aspect : maxW / (2 * aspect)))
  const pageW = Math.round(pageH * aspect)
  const pagesW = pageW * perView
  const spine = single ? 6 : 0
  const width = pagesW + COVER * 2 + spine
  const height = pageH + COVER * 2 + 6

  const spreadStop = slot === "left" ? { x: stop.x / 2, y: stop.y } : slot === "right" ? { x: 50 + stop.x / 2, y: stop.y } : stop
  const cursorLayer = active && slot !== "turn" && (
    <div className="pointer-events-none absolute inset-0 z-40">
      <AiCursor
        stop={spreadStop}
        note={note}
        onNoteDone={() => {
          setNote(null)
          advance()
        }}
      />
    </div>
  )

  return (
    <div aria-hidden className={cn("relative transition-[filter] duration-500", failed && "grayscale")} style={{ width, height }}>
      <div className="absolute -bottom-5 left-1/2 h-10 w-[94%] -translate-x-1/2 rounded-[50%] bg-slate-900/25 blur-2xl" />
      <div className="absolute -bottom-1 left-1/2 h-3 w-[86%] -translate-x-1/2 rounded-[50%] bg-slate-900/30 blur-md" />
      <div className="am-cloth absolute inset-0 rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_0_rgba(0,0,0,0.3),0_1px_2px_rgba(15,23,42,0.3)]">
        {single ? <div className="absolute inset-y-0 left-0 w-5 rounded-l-[10px] bg-gradient-to-r from-black/35 to-transparent" /> : <div className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/40 to-transparent" />}
      </div>

      <div className="absolute [perspective:2400px]" style={{ left: COVER + spine, top: COVER, width: pagesW, height: pageH }}>
        {single ? (
          <>
            <div className="absolute inset-0">
              <Stack free="right" />
              <div className="am-curve-single relative size-full overflow-hidden rounded-r-[3px]">
                <Paper src={turning ? next[0] : view[0]} binding="left" />
              </div>
            </div>
            {turning && (
              <div className="absolute inset-0 z-10 origin-left [transform-style:preserve-3d] motion-safe:animate-[am-leaf-single_cubic-bezier(0.45,0,0.2,1)_both]" style={{ animationDuration: `${TURN_MS}ms` }}>
                <div className="am-curve-single absolute inset-0 overflow-hidden rounded-r-[3px] [backface-visibility:hidden]">
                  <Paper src={view[0]} binding="left" />
                  <div className="absolute inset-0 bg-[linear-gradient(to_left,rgba(0,0,0,0.05),rgba(0,0,0,0.3))] motion-safe:animate-[am-turn-shade_ease-in-out_both]" style={{ animationDuration: `${TURN_MS}ms` }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="absolute inset-y-0 left-0 w-1/2 origin-right [transform:rotateY(5deg)]">
              <Stack free="left" />
              <div className="am-curve-left relative size-full overflow-hidden rounded-l-[3px]">
                <Paper src={view[0]} binding="right" />
              </div>
            </div>
            <div className="absolute inset-y-0 right-0 w-1/2 origin-left [transform:rotateY(-5deg)]">
              <Stack free="right" />
              <div className="am-curve-right relative size-full overflow-hidden rounded-r-[3px]">
                <Paper src={turning ? next[1] : view[1]} binding="left" />
              </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-y-[1%] left-1/2 w-[3px] -translate-x-1/2 bg-gradient-to-r from-black/5 via-black/40 to-black/5" />
            {turning && (
              <div className="absolute inset-y-0 right-0 z-10 w-1/2 origin-left [transform-style:preserve-3d] motion-safe:animate-[am-leaf_cubic-bezier(0.45,0,0.2,1)_both]" style={{ animationDuration: `${TURN_MS}ms` }}>
                <div className="am-curve-right absolute inset-0 overflow-hidden rounded-r-[3px] [backface-visibility:hidden]">
                  <Paper src={view[1]} binding="left" />
                  <div className="absolute inset-0 bg-[linear-gradient(to_left,rgba(0,0,0,0.05),rgba(0,0,0,0.3))] motion-safe:animate-[am-turn-shade_ease-in-out_both]" style={{ animationDuration: `${TURN_MS}ms` }} />
                </div>
                <div className="am-curve-left absolute inset-0 overflow-hidden rounded-l-[3px] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <Paper src={next[0]} binding="right" />
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.05),rgba(0,0,0,0.3))] motion-safe:animate-[am-turn-shade_ease-in-out_both]" style={{ animationDuration: `${TURN_MS}ms` }} />
                </div>
              </div>
            )}
          </>
        )}
        {cursorLayer}
      </div>

    </div>
  )
}
