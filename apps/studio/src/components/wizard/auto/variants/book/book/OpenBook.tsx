import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useReducedEffects } from "@/lib/effects"
import { cn } from "@/lib/utils"
import { sameView, viewOf } from "../model"
import { Page, Warm, type Side } from "./Page"

export const COVER = 12
const TURN_MS = 720
const OPEN_MS = 1150
/* eslint-disable lingui/no-unlocalized-strings -- animation easings, never shown */
const EASE = "cubic-bezier(0.45, 0, 0.2, 1)"
const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)"
const CLOSE = "cubic-bezier(0.4, 0, 0.2, 1)"
/* eslint-enable lingui/no-unlocalized-strings */

type Turn = { from: number; to: number; dir: 1 | -1 }

/** The open book's size for a page size: two pages (or one) inside a cloth cover. */
export function bookSize(pageW: number, pageH: number, single: boolean) {
  return { width: pageW * (single ? 1 : 2) + COVER * 2 + (single ? 6 : 0), height: pageH + COVER * 2 }
}

/**
 * The user's own book, open on the real PDF pages. Changing `page` turns the leaf to the view that
 * holds it (forward or back); with reduced effects the view just changes. `opening` plays the cover
 * swinging open once, from the closed book the upload step showed. `overlay(n)` adds things on page
 * n (the notes' flags), `lit` rings the pages the active note points to. Arrow keys turn the pages.
 */
export function OpenBook({
  file,
  numPages,
  single,
  page,
  pageW,
  pageH,
  cover,
  opening,
  closing,
  onClosed,
  dimmed,
  lit = [],
  overlay,
  label,
  onStep,
  children,
}: {
  file: File
  numPages: number
  single: boolean
  page: number
  pageW: number
  pageH: number
  cover?: string
  opening?: boolean
  /** Closes the book over its cover, then calls `onClosed` (at once with reduced effects). */
  closing?: boolean
  onClosed?: () => void
  dimmed?: boolean
  lit?: number[]
  overlay?: (page: number) => ReactNode
  label: string
  onStep?: (dir: 1 | -1) => void
  children?: ReactNode
}) {
  const reduced = useReducedEffects()
  const [shown, setShown] = useState(page)
  const [turn, setTurn] = useState<Turn | null>(null)
  const leaf = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const coverLeaf = useRef<HTMLDivElement>(null)
  const [isOpening, setIsOpening] = useState(!!opening && !reduced)
  const thumbW = Math.max(200, Math.round(pageW / 50) * 50)
  const { width, height } = bookSize(pageW, pageH, single)

  useEffect(() => {
    if (turn) return
    if (sameView(page, shown, numPages, single)) {
      if (page !== shown) setShown(page)
      return
    }
    if (reduced || isOpening) return setShown(page)
    setTurn({ from: shown, to: page, dir: page > shown ? 1 : -1 })
  }, [page, shown, turn, reduced, numPages, single, isOpening])

  useLayoutEffect(() => {
    if (!turn || !leaf.current) return
    const forward = turn.dir === 1
    const keyframes = single
      ? [
          { transform: "rotateY(0deg)", opacity: 1 },
          { transform: "rotateY(-60deg)", opacity: 1, offset: 0.55 },
          { transform: "rotateY(-110deg)", opacity: 0 },
        ]
      : [{ transform: "rotateY(0deg)" }, { transform: `rotateY(${forward ? -90 : 90}deg) translateZ(14px)`, offset: 0.5 }, { transform: `rotateY(${forward ? -180 : 180}deg)` }]
    const animation = leaf.current.animate(keyframes, { duration: TURN_MS, easing: EASE, fill: "both" })
    animation.onfinish = () => {
      setShown(turn.to)
      setTurn(null)
    }
    return () => animation.cancel()
  }, [turn, single])

  useLayoutEffect(() => {
    if (!isOpening || !frame.current || !coverLeaf.current) return
    const shift = single ? 0 : -pageW / 2
    const anims = [
      frame.current.animate([{ transform: `translateX(${shift}px) scale(0.92)` }, { transform: "none" }], { duration: OPEN_MS, easing: SETTLE, fill: "both" }),
      coverLeaf.current.animate(
        single
          ? [{ transform: "rotateY(0deg)", opacity: 1 }, { transform: "rotateY(-70deg)", opacity: 1, offset: 0.6 }, { transform: "rotateY(-110deg)", opacity: 0 }]
          : [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-90deg) translateZ(20px)", offset: 0.5 }, { transform: "rotateY(-180deg)" }],
        { duration: OPEN_MS, easing: EASE, fill: "both" },
      ),
    ]
    if (!single)
      frame.current.querySelectorAll("[data-left-half]").forEach((el) => anims.push(el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { duration: OPEN_MS, fill: "both" })))
    anims[1].onfinish = () => setIsOpening(false)
    return () => anims.forEach((a) => a.cancel())
  }, [isOpening])

  const closeLeaf = useRef<HTMLDivElement>(null)
  const closed = useRef(onClosed)
  closed.current = onClosed
  useLayoutEffect(() => {
    if (!closing) return
    if (reduced || !frame.current || !closeLeaf.current) {
      closed.current?.()
      return
    }
    const shift = single ? 0 : -pageW / 2
    const anims = [
      closeLeaf.current.animate(
        single
          ? [{ transform: "rotateY(-110deg)", opacity: 0 }, { transform: "rotateY(-60deg)", opacity: 1, offset: 0.4 }, { transform: "rotateY(0deg)", opacity: 1 }]
          : [{ transform: "rotateY(0deg)" }, { transform: "rotateY(90deg) translateZ(20px)", offset: 0.5 }, { transform: "rotateY(180deg)" }],
        { duration: OPEN_MS * 0.8, easing: EASE, fill: "both" },
      ),
      frame.current.animate(
        [{ transform: "none", opacity: 1 }, { transform: `translateX(${shift}px) scale(0.94)`, opacity: 1, offset: 0.75 }, { transform: `translateX(${shift}px) scale(0.86) translateY(-8px)`, opacity: 0 }],
        { duration: OPEN_MS * 1.1, easing: CLOSE, fill: "both" },
      ),
    ]
    if (!single)
      frame.current.querySelectorAll("[data-left-half]").forEach((el) => anims.push(el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }], { duration: OPEN_MS * 0.8, fill: "both" })))
    anims[1].onfinish = () => closed.current?.()
    return () => anims.forEach((a) => a.cancel())
  }, [closing])

  const from = viewOf(turn ? turn.from : shown, numPages, single)
  const to = viewOf(turn ? turn.to : shown, numPages, single)
  const forward = turn?.dir !== -1
  const still = !turn && !isOpening && !closing
  const sheet = (n: number | null, side: Side, withOverlay = still) => (
    <Page file={file} page={n} side={side} width={thumbW} lit={still && n !== null && lit.includes(n)} overlay={withOverlay && n !== null ? overlay?.(n) : undefined} />
  )
  const next = viewOf(Math.min(numPages, (to[to.length - 1] ?? 1) + 1), numPages, single)
  const prev = viewOf(Math.max(1, (to[0] ?? 2) - 1), numPages, single)

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") onStep?.(1)
    else if (e.key === "ArrowLeft") onStep?.(-1)
    else return
    e.preventDefault()
  }

  return (
    <div className="relative" style={{ width, height }}>
      <div ref={frame} className={cn("absolute inset-0 isolate transition-[filter] duration-500", dimmed && "grayscale")}>
        <div aria-hidden className="absolute -bottom-5 left-1/2 h-10 w-[94%] -translate-x-1/2 rounded-[50%] bg-slate-900/25 blur-2xl dark:bg-black/50" />
        <div aria-hidden className="absolute -bottom-1 left-1/2 h-3 w-[86%] -translate-x-1/2 rounded-[50%] bg-slate-900/30 blur-md dark:bg-black/60" />
        <div data-left-half aria-hidden className={cn("absolute inset-y-0 left-0 rounded-l-[10px] bg-[oklch(0.42_0.13_260)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_0_rgba(0,0,0,0.3)]", single ? "w-5" : "w-1/2")} />
        <div aria-hidden className={cn("absolute inset-y-0 right-0 rounded-r-[10px] bg-[oklch(0.42_0.13_260)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_0_rgba(0,0,0,0.3)]", single ? "left-3" : "w-1/2")} />
        {!single && <div aria-hidden className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/40 to-transparent" />}

        <div
          role="group"
          aria-roledescription="book"
          aria-label={label}
          tabIndex={onStep ? 0 : -1}
          onKeyDown={onKeyDown}
          className="absolute rounded-[4px] outline-none [perspective:2400px] focus-visible:ring-4 focus-visible:ring-brand-400/60 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          style={{ left: COVER + (single ? 6 : 0), top: COVER, width: pageW * (single ? 1 : 2), height: pageH }}
        >
          {single ? (
            <div className="absolute inset-0">{sheet(to[0], "single")}</div>
          ) : (
            <>
              <div data-left-half className="absolute inset-y-0 left-0 w-1/2">
                {sheet(forward ? from[0] : to[0], "left")}
              </div>
              <div className="absolute inset-y-0 right-0 w-1/2">{sheet(forward ? to[1] : from[1], "right")}</div>
              <div aria-hidden className="pointer-events-none absolute inset-y-[1%] left-1/2 w-[3px] -translate-x-1/2 bg-gradient-to-r from-black/5 via-black/35 to-black/5" />
            </>
          )}

          {turn && (
            <div
              ref={leaf}
              aria-hidden
              className={cn("absolute inset-y-0 z-10 [transform-style:preserve-3d]", single ? "inset-x-0 origin-left" : forward ? "right-0 w-1/2 origin-left" : "left-0 w-1/2 origin-right")}
            >
              {single ? (
                <div className="absolute inset-0 [backface-visibility:hidden]">{sheet(from[0], "single", false)}</div>
              ) : (
                <>
                  <div className="absolute inset-0 [backface-visibility:hidden]">{sheet(forward ? from[1] : from[0], forward ? "right" : "left", false)}</div>
                  <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">{sheet(forward ? to[0] : to[1], forward ? "left" : "right", false)}</div>
                </>
              )}
            </div>
          )}

          {closing && (
            <div ref={closeLeaf} aria-hidden className={cn("absolute inset-y-[-12px] z-20 [transform-style:preserve-3d]", single ? "-left-[18px] right-[-12px] origin-left" : "left-[-12px] right-1/2 origin-right")}>
              {!single && (
                <div className="absolute inset-0 rounded-l-[10px] bg-[oklch(0.42_0.13_260)] [backface-visibility:hidden]">
                  <div className="absolute inset-[12px] overflow-hidden rounded-[3px]">{sheet(to[0], "left", false)}</div>
                </div>
              )}
              <div className={cn("absolute inset-0 overflow-hidden rounded-r-[10px] bg-[oklch(0.42_0.13_260)] shadow-xl [backface-visibility:hidden]", !single && "[transform:rotateY(180deg)]")}>
                {cover && <img src={cover} alt="" className="size-full object-cover" />}
                <span className="am-book-hinge" />
              </div>
            </div>
          )}

          {isOpening && (
            <div ref={coverLeaf} aria-hidden className={cn("absolute inset-y-[-12px] z-20 origin-left [transform-style:preserve-3d]", single ? "-left-[18px] right-[-12px]" : "right-[-12px] left-1/2")}>
              <div className="absolute inset-0 overflow-hidden rounded-r-[10px] bg-[oklch(0.42_0.13_260)] shadow-xl [backface-visibility:hidden]">
                {cover && <img src={cover} alt="" className="size-full object-cover" />}
                <span className="am-book-hinge" />
              </div>
              <div className="absolute inset-0 rounded-l-[10px] bg-[oklch(0.42_0.13_260)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="absolute inset-[12px] rounded-[3px] bg-[#e9e2d2]" />
              </div>
            </div>
          )}
        </div>
        {children}
      </div>
      {[...next, ...prev].map((n) => (n !== null ? <Warm key={`w${n}`} file={file} page={n} width={thumbW} /> : null))}
    </div>
  )
}
