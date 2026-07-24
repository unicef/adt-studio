import { useEffect, useRef, useState, type ReactNode } from "react"

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
  render,
}: {
  /** Height reserved while loading (released to content height once ready). */
  reservedClassName?: string
  render: (onReady: () => void) => ReactNode
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return
    const id = setTimeout(() => setReady(true), 5000)
    return () => clearTimeout(id)
  }, [ready])

  return (
    <div className={`relative ${ready ? "" : `${reservedClassName} overflow-hidden`}`}>
      <div className={ready ? "animate-in fade-in-0 duration-200" : "invisible"}>
        {render(() => setReady(true))}
      </div>
      {!ready && <div className="absolute inset-0 animate-pulse bg-muted" />}
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
