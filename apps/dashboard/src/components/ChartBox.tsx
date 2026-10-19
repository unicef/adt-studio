import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"

export interface TipRow {
  label: string
  value: string
  color?: string
}

export interface Tip {
  show(event: MouseEvent, title: string, rows: TipRow[]): void
  hide(): void
}

interface Hover {
  x: number
  y: number
  title: string
  rows: TipRow[]
}

interface ChartBoxProps {
  minHeight: number
  children: (width: number, tip: Tip) => ReactNode
}

export function ChartBox({ minHeight, children }: ChartBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    setWidth(Math.floor(element.clientWidth))
    return () => observer.disconnect()
  }, [])

  const tip = useMemo<Tip>(
    () => ({
      show(event, title, rows) {
        const box = ref.current?.getBoundingClientRect()
        if (!box) return
        setHover({ x: event.clientX - box.left, y: event.clientY - box.top, title, rows })
      },
      hide() {
        setHover(null)
      },
    }),
    [],
  )

  const content = useMemo(() => (width > 0 ? children(width, tip) : null), [width, children, tip])

  return (
    <div ref={ref} className="relative min-w-0" style={{ minHeight }}>
      {content}
      {hover && <Tooltip hover={hover} width={width} />}
    </div>
  )
}

function Tooltip({ hover, width }: { hover: Hover; width: number }) {
  const flipX = hover.x > width - 260
  const flipY = hover.y > 140
  return (
    <div
      className="pointer-events-none absolute z-10 flex max-w-72 flex-col gap-0.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        left: flipX ? hover.x - 14 : hover.x + 14,
        top: flipY ? hover.y - 10 : hover.y + 16,
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      <div className="text-ink-2">{hover.title}</div>
      {hover.rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {row.color && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />}
          <span className="flex-1 text-ink-2">{row.label}</span>
          <b className="font-medium tabular-nums text-ink">{row.value}</b>
        </div>
      ))}
    </div>
  )
}
