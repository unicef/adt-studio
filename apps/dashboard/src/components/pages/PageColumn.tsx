import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { Swatch } from "../Card"
import { BaselineBadge } from "../ConversionPicker"

const BOX = "relative h-[min(78dvh,56rem)] overflow-hidden rounded-lg border border-line bg-white"

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

interface ColumnProps {
  title: string
  color?: string
  isBase?: boolean
  href?: string | null
  detail?: ReactNode
  children: ReactNode
}

export function PageColumn({ title, color, isBase = false, href, detail, children }: ColumnProps) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-[3.25rem] flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {color && <Swatch color={color} />}
          <span className="truncate font-medium text-ink" title={title}>
            {title}
          </span>
          {isBase && <BaselineBadge />}
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="ml-auto shrink-0 rounded text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent">
              Open ↗
            </a>
          )}
        </div>
        {detail}
      </div>
      {children}
    </section>
  )
}

export function SectionChips({ types, baseline }: { types: string[]; baseline: string[] | null }) {
  const counts = new Map<string, number>()
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1)
  const known = new Set(baseline ?? types)
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Sections on this page">
      {[...counts].map(([type, count]) => (
        <li
          key={type}
          title={known.has(type) ? undefined : "Not on the baseline page"}
          className={`rounded-full border px-1.5 py-px text-[11px] ${known.has(type) ? "border-line text-muted" : "border-transparent bg-warn-bg text-warn"}`}
        >
          {type}
          {count > 1 && <span className="tabular-nums"> ×{count}</span>}
        </li>
      ))}
    </ul>
  )
}

export function Placeholder({ children }: { children: ReactNode }) {
  return <div className={`${BOX} grid place-items-center bg-ink/[0.03]! p-6 text-center text-sm text-muted`}>{children}</div>
}

export function OriginalPage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className={`${BOX} overflow-y-auto`}>
      <img src={src} alt={alt} draggable={false} className="block h-auto w-full" />
    </div>
  )
}

interface PageFrameProps {
  src: string
  title: string
  viewportWidth: number
  onWindow: (target: Window | null) => void
}

export function PageFrame(props: PageFrameProps) {
  return <FrameBody key={props.src} {...props} />
}

function FrameBody({ src, title, viewportWidth, onWindow }: PageFrameProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(boxRef)
  const [loaded, setLoaded] = useState(false)
  const onWindowRef = useRef(onWindow)
  onWindowRef.current = onWindow
  const scale = size.width > 0 ? Math.min(1, size.width / viewportWidth) : 1

  useEffect(() => () => onWindowRef.current(null), [])

  return (
    <div ref={boxRef} className={BOX}>
      {size.width > 0 && (
        <iframe
          src={src}
          title={title}
          sandbox="allow-same-origin"
          onLoad={(event) => {
            setLoaded(true)
            onWindowRef.current(event.currentTarget.contentWindow)
          }}
          style={{ width: viewportWidth, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          className={`block border-0 transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {!loaded && (
        <p role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted">
          <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
          Rendering page…
        </p>
      )}
      {scale < 1 && (
        <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-ink/70 px-1.5 py-px text-[10px] text-white tabular-nums">
          {Math.round(scale * 100)}%
        </span>
      )}
    </div>
  )
}
