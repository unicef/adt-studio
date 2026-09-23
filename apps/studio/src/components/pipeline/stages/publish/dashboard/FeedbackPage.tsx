import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileQuestion, Loader2 } from "lucide-react"
import { usePage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { BookPreviewFrame, type BookPreviewFrameHandle } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import { contentRoot, resolveAnchorElement } from "@/components/publication-feedback/lib/anchor-resolution"
import type { DashThread } from "./dashboard-data"
import { initialOf } from "./helpers"

/** The width the page is laid out at before it is scaled into the panel — the tablet layout,
 *  which reads well at the size the panel can give it. */
const PAGE_RENDER_WIDTH = 820
/** Pins follow their elements while fonts and images settle, and after any resize. */
const REMEASURE_MS = 500
const QUOTE_MAX = 90
// eslint-disable-next-line lingui/no-unlocalized-strings -- a media query, not user text
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

/** Where a comment points, as the comment header describes it. */
export type CommentLocation =
  | { kind: "loading" }
  | { kind: "placed"; quote: string | null; picture: boolean }
  | { kind: "page" }
  | { kind: "moved" }
  /** The page itself can't be shown here, so neither can the spot; the panel says why. */
  | { kind: "unavailable" }

interface Pin {
  thread: DashThread
  x: number
  y: number
  box: { left: number; top: number; width: number; height: number }
}

function quoteOf(element: Element): { quote: string | null; picture: boolean } {
  if (element.tagName === "IMG") {
    const alt = element.getAttribute("alt")?.trim() ?? ""
    return { quote: alt === "" ? null : alt, picture: true }
  }
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim()
  if (text === "") return { quote: null, picture: false }
  return { quote: text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1).trimEnd()}…` : text, picture: false }
}

/**
 * The page a comment is about, as the Storyboard draws it, with its comments pinned where the
 * readers left them.
 *
 * Selecting a comment scrolls its pin into the middle of the view and briefly outlines the thing
 * it is on, so the author sees *what* was meant, not just which page. What the pin is on is also
 * read back as a quote for the comment header; when a pin's element has gone (the page changed
 * after the comment), that is reported rather than guessed.
 */
export function FeedbackPage({
  bookLabel,
  thread,
  threads,
  onSelectThread,
  onLocate,
}: {
  bookLabel: string
  thread: DashThread
  /** Every comment on this section, so the others show as quieter pins around the selected one. */
  threads: DashThread[]
  onSelectThread: (id: string) => void
  onLocate: (id: string, location: CommentLocation) => void
}) {
  const { t } = useLingui()
  const frameRef = useRef<BookPreviewFrameHandle>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [pins, setPins] = useState<Pin[]>([])
  const [flash, setFlash] = useState(0)
  const page = usePage(bookLabel, thread.pageId ?? "")
  const sectionIndex = Math.max(0, (thread.sectionNumber ?? 1) - 1)
  const rendered = page.data?.rendering?.sections.find((section) => section.sectionIndex === sectionIndex) ?? null
  const unavailable = thread.pageId === null || page.isError || (!page.isPending && !rendered?.html)
  const sectionKey = threads
    .filter((other) => other.pageSectionId === thread.pageSectionId)
    .map((other) => `${other.id}:${other.resolved ? 1 : 0}`)
    .join(",")
  const onSection = useMemo(
    () => threads.filter((other) => other.pageSectionId === thread.pageSectionId),
    [sectionKey],
  )

  const measure = useCallback(() => {
    const doc = frameRef.current?.getDocument() ?? null
    const iframeRect = frameRef.current?.getIframeRect() ?? null
    const containerRect = containerRef.current?.getBoundingClientRect() ?? null
    const root = contentRoot(doc)
    if (!doc || !iframeRect || !containerRect || !root) return null
    const layoutWidth = doc.documentElement.clientWidth || PAGE_RENDER_WIDTH
    const scale = iframeRect.width / layoutWidth
    const next: Pin[] = []
    for (const other of onSection) {
      if (!other.anchor) continue
      const element = resolveAnchorElement(other.anchor, root)
      if (!element) continue
      const rect = element.getBoundingClientRect()
      const offsetX = iframeRect.left - containerRect.left
      const offsetY = iframeRect.top - containerRect.top
      next.push({
        thread: other,
        x: offsetX + (rect.left + (rect.width * other.anchor.xOffsetPct) / 100) * scale,
        y: offsetY + (rect.top + (rect.height * other.anchor.yOffsetPct) / 100) * scale,
        box: { left: offsetX + rect.left * scale, top: offsetY + rect.top * scale, width: rect.width * scale, height: rect.height * scale },
      })
    }
    return { next, root }
  }, [onSection])
  const measureRef = useRef(measure)
  measureRef.current = measure
  const locateRef = useRef(onLocate)
  locateRef.current = onLocate

  /** Keep the pins on their elements as the page settles and resizes. */
  useEffect(() => {
    if (!ready) return
    const tick = () => {
      const result = measure()
      if (result) setPins(result.next)
    }
    tick()
    const timer = window.setInterval(tick, REMEASURE_MS)
    return () => window.clearInterval(timer)
  }, [measure, ready])

  /** On selecting a comment: say where it points, bring its pin into view, and flash the element. */
  useEffect(() => {
    const locate = locateRef.current
    const scroller = containerRef.current?.closest<HTMLElement>("[data-page-scroll]") ?? null
    const reduce = window.matchMedia(REDUCED_MOTION).matches
    if (!thread.anchor) {
      locate(thread.id, { kind: "page" })
      if (ready) scroller?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
      return
    }
    if (unavailable) {
      locate(thread.id, { kind: "unavailable" })
      return
    }
    if (!ready) {
      locate(thread.id, { kind: "loading" })
      return
    }
    const result = measureRef.current()
    const element = result ? resolveAnchorElement(thread.anchor, result.root) : null
    if (!result || !element) {
      locate(thread.id, { kind: "moved" })
      return
    }
    setPins(result.next)
    locate(thread.id, { kind: "placed", ...quoteOf(element) })
    const pin = result.next.find((candidate) => candidate.thread.id === thread.id)
    if (pin && scroller) {
      scroller.scrollTo({ top: Math.max(0, pin.y - scroller.clientHeight / 2 + 16), behavior: reduce ? "auto" : "smooth" })
    }
    setFlash((value) => value + 1)
  }, [ready, thread.anchor, thread.id, unavailable])

  if (thread.pageId === null) {
    return (
      <Message icon={<FileQuestion className="size-5" aria-hidden="true" />}>
        <Trans>This comment isn't tied to a page Studio can find.</Trans>
      </Message>
    )
  }

  if (page.isPending) {
    return (
      <Message icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
        <Trans>Opening the page…</Trans>
      </Message>
    )
  }

  if (page.isError) {
    return (
      <Message icon={<FileQuestion className="size-5" aria-hidden="true" />}>
        <Trans>Studio couldn't open this page right now. Open it in the Storyboard to see it.</Trans>
      </Message>
    )
  }

  if (!rendered?.html) {
    return (
      <Message icon={<FileQuestion className="size-5" aria-hidden="true" />}>
        <Trans>This section has no rendering in Studio right now. Open it in the Storyboard to see it.</Trans>
      </Message>
    )
  }

  const selectedPin = pins.find((pin) => pin.thread.id === thread.id) ?? null

  return (
    <div ref={containerRef} className="relative w-full">
      <BookPreviewFrame
        ref={frameRef}
        html={rendered.html}
        bookLabel={bookLabel}
        className="w-full"
        renderWidth={PAGE_RENDER_WIDTH}
        bodyFontFamily={page.data?.reflowableFontFamily ?? undefined}
        onReady={() => setReady(true)}
      />

      <div className="pointer-events-none absolute inset-0 z-20">
        {selectedPin ? (
          <span
            key={`${thread.id}-${flash}`}
            aria-hidden="true"
            style={{
              left: selectedPin.box.left - 4,
              top: selectedPin.box.top - 4,
              width: selectedPin.box.width + 8,
              height: selectedPin.box.height + 8,
            }}
            className="absolute rounded-md ring-2 ring-brand-500 motion-safe:animate-[feedback-pin-flash_1.8s_ease-out_forwards] motion-reduce:opacity-40"
          />
        ) : null}
        {pins.map((pin) => {
          const selected = pin.thread.id === thread.id
          return (
            <button
              key={pin.thread.id}
              type="button"
              onClick={() => onSelectThread(pin.thread.id)}
              aria-label={t`Comment by ${pin.thread.authorName}`}
              aria-current={selected}
              style={{ left: pin.x, top: pin.y, backgroundColor: pin.thread.authorColor }}
              className={cn(
                "pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none font-bold text-white shadow-md ring-2 ring-white transition-[transform,opacity] duration-200 hover:scale-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 motion-reduce:transition-none",
                selected ? "z-10 size-8 text-xs ring-4 ring-brand-200" : "size-6 text-[11px] opacity-70",
                pin.thread.resolved && !selected && "opacity-40 saturate-50",
              )}
            >
              {initialOf(pin.thread.authorName)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Message({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-8 py-10 text-center text-xs text-muted-foreground">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">{icon}</span>
      {children}
    </div>
  )
}
