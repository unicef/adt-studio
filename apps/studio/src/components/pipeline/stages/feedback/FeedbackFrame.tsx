import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react"
import { msg } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { contentRoot, resolveAnchorPoint, scrollAnchorIntoView } from "./lib/anchor-resolution"
import { readableTextColor, type FeedbackThread } from "./lib/threads"
import type { VisibleCursor } from "./lib/room"

/** Layout settles after `load`: web fonts swap and images arrive late, and either moves the
 *  box a pin is anchored to. The snapshot is static, so two passes are enough where the
 *  reader needs a whole observer web. */
const SETTLE_DELAYS_MS = [120, 700]

interface PinPosition {
  threadId: string
  x: number
  y: number
}

interface CursorPosition {
  peerId: string
  name: string
  color: string
  x: number
  y: number
}

export interface FeedbackFrameProps {
  src: string
  threads: FeedbackThread[]
  pinNumbers: Map<string, number>
  selectedThreadId: string | null
  flashToken: number
  onSelectThread: (threadId: string) => void
  onPageChange: (page: { sectionId: string | null; href: string | null }) => void
  onUnresolvableChange: (threadIds: string[]) => void
  reducedMotion: boolean
  /** Live reviewer cursors on the framed page, resolved through the same anchor engine. */
  cursors: VisibleCursor[]
}

export function FeedbackFrame({
  src,
  threads,
  pinNumbers,
  selectedThreadId,
  flashToken,
  onSelectThread,
  onPageChange,
  onUnresolvableChange,
  reducedMotion,
  cursors,
}: FeedbackFrameProps) {
  const { i18n } = useLingui()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<PinPosition[]>([])
  const [cursorPositions, setCursorPositions] = useState<CursorPosition[]>([])
  const [loadToken, setLoadToken] = useState(0)
  const unresolvableRef = useRef<string>("")

  const anchored = useMemo(
    () => threads.filter((thread) => thread.root.anchor !== null),
    [threads],
  )

  const recompute = useCallback(() => {
    const iframe = iframeRef.current
    const container = containerRef.current
    if (!iframe || !container) return

    let doc: Document | null = null
    try {
      doc = iframe.contentDocument
    } catch {
      doc = null
    }
    const root = contentRoot(doc)
    if (!root) {
      setPositions([])
      return
    }

    const iframeRect = iframe.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const offsetX = iframeRect.left - containerRect.left
    const offsetY = iframeRect.top - containerRect.top

    const next: PinPosition[] = []
    const missing: string[] = []
    for (const thread of anchored) {
      const anchor = thread.root.anchor
      if (!anchor) continue
      const point = resolveAnchorPoint(anchor, root)
      if (!point) {
        missing.push(thread.root.id)
        continue
      }
      const inside =
        point.x >= 0 && point.y >= 0 && point.x <= iframeRect.width && point.y <= iframeRect.height
      if (!inside) continue
      next.push({ threadId: thread.root.id, x: offsetX + point.x, y: offsetY + point.y })
    }

    setPositions(next)

    /** Measured in the same pass as the pins, off the same rects: a cursor and a pin sitting on
     *  the same word must not disagree by a frame's worth of scrolling. */
    const live: CursorPosition[] = []
    for (const cursor of cursors) {
      const point = resolveAnchorPoint(
        {
          selector: cursor.selector,
          xOffsetPct: cursor.xOffsetPct,
          yOffsetPct: cursor.yOffsetPct,
        },
        root,
      )
      if (!point) continue
      if (point.x < 0 || point.y < 0) continue
      if (point.x > iframeRect.width || point.y > iframeRect.height) continue
      live.push({
        peerId: cursor.peerId,
        name: cursor.name,
        color: cursor.color,
        x: offsetX + point.x,
        y: offsetY + point.y,
      })
    }
    setCursorPositions(live)

    const key = missing.sort().join("|")
    if (key !== unresolvableRef.current) {
      unresolvableRef.current = key
      onUnresolvableChange(missing)
    }
  }, [anchored, cursors, onUnresolvableChange])

  const syncPage = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      const sectionId =
        doc?.querySelector('meta[name="title-id"]')?.getAttribute("content") ?? null
      const href = iframe.contentWindow?.location.pathname.split("/").pop() ?? null
      onPageChange({ sectionId, href })
    } catch {
      onPageChange({ sectionId: null, href: null })
    }
  }, [onPageChange])

  /** Every listener and timer below goes through this ref rather than closing over
   *  `recompute` directly. A handler registered at `load` outlives several renders, and the
   *  thread set it has to measure usually arrives *after* that load — a captured closure
   *  would keep measuring the empty list and wipe pins that a later render had drawn. */
  const recomputeRef = useRef(recompute)
  useEffect(() => {
    recomputeRef.current = recompute
  }, [recompute])
  const measure = useCallback(() => recomputeRef.current(), [])

  const onIframeLoad = useCallback(() => {
    setLoadToken((token) => token + 1)
    syncPage()
    measure()
  }, [measure, syncPage])

  /** Re-armed per load, because each navigation inside the frame is a new document. */
  useEffect(() => {
    if (loadToken === 0) return
    const iframe = iframeRef.current
    const iframeWindow = iframe?.contentWindow ?? null
    const doc = iframe?.contentDocument ?? null

    iframeWindow?.addEventListener("resize", measure)
    /** Capture phase on the document, because a scroll event does not bubble and the reader
     *  scrolls an inner container rather than the page. */
    doc?.addEventListener("scroll", measure, true)
    const timers = SETTLE_DELAYS_MS.map((delay) => window.setTimeout(measure, delay))

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      iframeWindow?.removeEventListener("resize", measure)
      doc?.removeEventListener("scroll", measure, true)
    }
  }, [loadToken, measure])

  useEffect(() => {
    if (loadToken === 0) return
    recompute()
  }, [loadToken, recompute])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  const [flashing, setFlashing] = useState(false)

  /** Jumping to a thread scrolls the anchored element into view inside the snapshot, then
   *  re-measures — the pin has to follow the scroll it just caused. */
  useEffect(() => {
    if (flashToken === 0 || selectedThreadId === null || loadToken === 0) return
    const thread = threads.find((candidate) => candidate.root.id === selectedThreadId)
    const anchor = thread?.root.anchor
    if (!anchor) return
    const root = contentRoot(iframeRef.current?.contentDocument ?? null)
    if (!scrollAnchorIntoView(anchor, root, reducedMotion ? "auto" : "smooth")) return
    setFlashing(true)
    const settle = window.setTimeout(measure, reducedMotion ? 0 : 320)
    const stop = window.setTimeout(() => setFlashing(false), 900)
    return () => {
      window.clearTimeout(settle)
      window.clearTimeout(stop)
    }
  }, [flashToken, loadToken, measure, reducedMotion, selectedThreadId, threads])

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 overflow-hidden bg-muted/20">
      <iframe
        ref={iframeRef}
        src={src}
        title={i18n._(msg`Published book`)}
        onLoad={onIframeLoad}
        className="h-full w-full border-0 bg-white"
      />

      {/* Reviewer cursors, under the pins: a pin is a thing to click, a cursor is a thing to
          watch, and the click target must never end up behind the decoration. */}
      <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
        {cursorPositions.map((cursor) => (
          <div
            key={cursor.peerId}
            className="absolute left-0 top-0 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
            style={{
              transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              transition: reducedMotion ? "none" : "transform 70ms linear",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 18 18"
              className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
            >
              <path
                d="M2 1.5 L2 14 L5.6 10.6 L8.2 16 L10.6 14.9 L8 9.7 L13 9.7 Z"
                fill={cursor.color}
                stroke="#ffffff"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="absolute left-3 top-3.5 max-w-[9rem] truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight shadow-sm"
              style={{ backgroundColor: cursor.color, color: readableTextColor(cursor.color) }}
            >
              {cursor.name}
            </span>
          </div>
        ))}
      </div>

      {/* The pins duplicate what the threads panel already exposes to assistive tech, so the
          overlay is hidden from it rather than offering a second, worse keyboard path. */}
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        {positions.map((position) => {
          const isSelected = position.threadId === selectedThreadId
          const thread = threads.find((candidate) => candidate.root.id === position.threadId)
          if (!thread) return null
          const color = thread.root.author_color
          return (
            <div
              key={position.threadId}
              style={{ left: position.x, top: position.y }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2",
                isSelected ? "z-20" : "z-10",
              )}
            >
              {isSelected && flashing && !reducedMotion ? (
                <span
                  className="absolute inset-0 animate-ping rounded-full"
                  style={{ backgroundColor: color, opacity: 0.5 }}
                />
              ) : null}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onSelectThread(position.threadId)}
                title={`${thread.root.author_name}: ${thread.root.body}`}
                style={{
                  backgroundColor: thread.resolved ? "#ffffff" : color,
                  color: thread.resolved ? color : readableTextColor(color),
                  borderColor: color,
                }}
                className={cn(
                  "pointer-events-auto relative flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full rounded-bl-none border px-1 text-[11px] font-semibold shadow-md",
                  "transition-transform duration-200 ease-out motion-reduce:transition-none",
                  "hover:scale-110",
                  isSelected ? "scale-[1.15] ring-2 ring-foreground/40 ring-offset-1" : null,
                )}
              >
                {pinNumbers.get(position.threadId) ?? "?"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
