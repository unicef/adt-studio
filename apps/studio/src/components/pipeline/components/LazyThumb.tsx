import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Measures an element's height (while `active`) and returns it, so a loading
 * skeleton can reserve the same height as the content it replaces and not
 * grow/shrink on reveal. Returns [callback ref to attach, measured px | null].
 *
 * Uses a callback ref (not an effect) so it attaches the observer the moment the
 * node mounts — robust even when the node is portalled in a tick after the
 * consumer renders (e.g. a Radix Dialog), where an effect-based observer races
 * the portal and can miss the element entirely.
 */
export function useReservedHeight<T extends HTMLElement>(
  active: boolean,
  measurementKey?: string
): [(node: T | null) => void, number | null] {
  const [measurement, setMeasurement] = useState<{
    key: string | undefined
    height: number
  } | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback(
    (node: T | null) => {
      roRef.current?.disconnect()
      roRef.current = null
      if (!node || !active || typeof ResizeObserver === "undefined") return
      const ro = new ResizeObserver(() => {
        const h = node.getBoundingClientRect().height
        if (h > 40) setMeasurement({ key: measurementKey, height: h })
      })
      ro.observe(node)
      roRef.current = ro
    },
    [active, measurementKey]
  )
  const height =
    measurement && measurement.key === measurementKey
      ? measurement.height
      : null
  return [ref, height]
}

/**
 * Wraps content whose natural (auto) height changes and animates the height
 * between values, so a residual layout shift glides instead of snapping. The
 * inner child is measured while unconstrained; the outer box takes that height
 * with a transition. The first measure applies instantly (auto → px doesn't
 * animate); subsequent changes ease. Honors `prefers-reduced-motion`.
 */
export function AnimatedHeight({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = innerRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height
      if (h > 0) setHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      className={`overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none ${className}`}
      style={{ height: height ?? "auto" }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

/**
 * Signals `onReady` on mount — wrap synchronous (non-iframe) preview content so
 * the version-picker skeleton reveals it immediately instead of waiting for the
 * fallback timer. Steps whose content is a plain React view (glossary, quizzes,
 * TOC, …) use this in their `renderPreview`.
 */
export function ReadyOnMount({
  onReady,
  children,
}: {
  onReady?: () => void
  children: ReactNode
}) {
  useEffect(() => {
    onReady?.()
  }, [onReady])
  return <>{children}</>
}

/**
 * Reserves a stable box and shows a pulsing skeleton until the previewed
 * content signals it's ready (via the `onReady` passed to `render`), then
 * reveals it with a fade. Prevents the multi-stage layout shift an iframe
 * causes as it loads (blank → default height → measured). A fallback timer
 * reveals anyway so static content (which never calls `onReady`) can't get
 * stuck behind the skeleton.
 */
export function PreviewSkeleton({
  reservedClassName = "h-40",
  reservedHeight,
  render,
}: {
  /** Height reserved while loading (released to content height once ready). */
  reservedClassName?: string
  /** Exact reserved height in px — overrides reservedClassName. Pass the first
   *  rendered preview's measured height so the skeleton matches the content and
   *  doesn't grow/shrink on reveal. */
  reservedHeight?: number
  render: (onReady: () => void) => ReactNode
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setReady(true), 5000)
    return () => clearTimeout(id)
  }, [ready])

  const usePx = !ready && reservedHeight != null && reservedHeight > 0
  return (
    <div
      className={`relative ${ready ? "" : usePx ? "overflow-hidden" : `${reservedClassName} overflow-hidden`}`}
      style={usePx ? { height: reservedHeight } : undefined}
    >
      <div className={ready ? "animate-in fade-in-0 duration-200" : "invisible"}>
        {render(() => setReady(true))}
      </div>
      {!ready && <div className="absolute inset-0 animate-pulse bg-muted" />}
    </div>
  )
}

/**
 * Crossfades between rendered versions without a skeleton flash on switch. Fills
 * a fixed-size positioned parent (each frame is `absolute inset-0` and scrolls
 * internally), so a tall page scrolls rather than resizing the pane. Keeps the
 * currently-shown version visible while the newly-selected one mounts and loads
 * hidden (so it recompiles its own styles), then fades the new one in and drops
 * the old. The very first version shows a pulse until it's ready.
 *
 * The parent MUST be `position: relative` with a definite height.
 */
export function PreviewCrossfade({
  value,
  render,
}: {
  /** Identifies the version to show; changing it triggers a crossfade. */
  value: number
  render: (value: number, onReady: () => void) => ReactNode
}) {
  // `ready` = the last version whose content finished loading (the good frame).
  // `prev` = a ready frame kept underneath while a new `value` loads, dropped
  // after the crossfade. Only these two frames are ever mounted, so nothing
  // accumulates and a not-yet-ready frame is never shown.
  const [ready, setReady] = useState<number | null>(null)
  const [prev, setPrev] = useState<number | null>(null)
  const readyRef = useRef<number | null>(null)
  readyRef.current = ready
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (dropTimer.current) clearTimeout(dropTimer.current)
    // Keep the last *ready* frame underneath (never a still-loading one) until
    // the new value is ready. If we're going back to the already-ready frame,
    // there's nothing to load and no underlay is needed. (`ready` is read via a
    // ref so this runs only on `value`, not on every load.)
    const r = readyRef.current
    setPrev(r != null && r !== value ? r : null)
  }, [value])

  useEffect(
    () => () => {
      if (dropTimer.current) clearTimeout(dropTimer.current)
    },
    []
  )

  const handleReady = (v: number) => {
    if (v !== value) return // ignore stale / underlay frames
    setReady(v)
    if (dropTimer.current) clearTimeout(dropTimer.current)
    dropTimer.current = setTimeout(() => setPrev(null), 240)
  }

  const frontReady = ready === value
  const showUnderlay = prev != null && prev !== value
  const frames = showUnderlay ? [prev as number, value] : [value]

  return (
    <div className="absolute inset-0">
      {frames.map((v) => {
        const isFront = v === value
        // Front stays hidden while it loads *only when* there's an underlay to
        // show meanwhile; with no underlay it renders under the pulse instead.
        const hidden = isFront && showUnderlay && !frontReady
        return (
          <div
            key={v}
            className="absolute inset-0 overflow-auto transition-opacity duration-200 motion-reduce:transition-none"
            style={{ opacity: hidden ? 0 : 1 }}
          >
            {render(v, () => handleReady(v))}
          </div>
        )
      })}
      {!showUnderlay && !frontReady && <div className="absolute inset-0 animate-pulse bg-muted" />}
    </div>
  )
}

/**
 * Lazily mounts its child only once scrolled into view — keeps a long version
 * history cheap, since each thumbnail is a live rendered iframe. Shows a
 * skeleton placeholder until then. The child self-sizes to its content height.
 *
 * Looks for the nearest scroll ancestor marked `[data-thumb-scroll]` as the
 * IntersectionObserver root, falling back to the viewport.
 */
export function LazyThumb({
  children,
  skeletonClassName = "h-24",
}: {
  children: ReactNode
  /** Sizing for the skeleton shown before the child mounts. */
  skeletonClassName?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { root: el.closest("[data-thumb-scroll]"), rootMargin: "150px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  return (
    <div ref={ref}>
      {visible ? (
        children
      ) : (
        <div className={`w-full animate-pulse bg-muted ${skeletonClassName}`} />
      )}
    </div>
  )
}
