import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Plural, useLingui } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Cover, MUTED, PdfDetails, type PdfProps } from "./parts"
import { PdfPages } from "./PdfPages"

const ROW = 40
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"

/**
 * The dock: a notch hanging from the top edge of the window, in the middle of the top bar, like a
 * MacBook notch app. Closed, it shows the PDF being set up (cover, name, pages) and, on wide
 * windows, the first picks; it bulges a little on hover and slides down when a PDF is chosen or
 * changed. Clicked, the same shape grows down and out into the PDF's details, See pages, Change
 * PDF and every pick so far (a pick opens its Check screen again; `onEdit` is null once the book
 * is being set up). Outside click or Esc folds it back. Motion stops with reduced motion or Reduce
 * effects. Nothing shows before a PDF is chosen.
 */
export function Dock({ flow, picks, onEdit, locked }: PdfProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)
  const dock = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ rowW: 0, bodyH: 0 })
  const fileKey = flow.fileKey

  // The shape follows its contents: the row's width closed, the body's height open.
  useLayoutEffect(() => {
    const measure = () => setSize({ rowW: row.current?.offsetWidth ?? 0, bodyH: body.current?.offsetHeight ?? 0 })
    measure()
    const ro = new ResizeObserver(measure)
    if (row.current) ro.observe(row.current)
    if (body.current) ro.observe(body.current)
    return () => ro.disconnect()
  }, [fileKey, !!flow.file])

  // Folds back on a click outside it or Esc (focus returns to the row).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!dock.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      row.current?.focus()
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  useEffect(() => setOpen(false), [fileKey])

  if (!flow.file) return null
  const file = flow.file
  const summary = picks.slice(0, 3).map((p) => p.value)
  const wide = typeof window === "undefined" ? 440 : Math.min(440, window.innerWidth - 24)
  // + 2 for the side borders (border-box), so the row is never clipped.
  const width = size.rowW ? (open ? Math.max(size.rowW, wide) : size.rowW) + 2 : undefined
  const height = open ? ROW + size.bodyH : hover ? ROW + 3 : ROW
  const close = () => setOpen(false)

  return (
    <div className="relative h-full shrink-0" style={{ width: size.rowW ? size.rowW + 2 : undefined }}>
      <div
        key={fileKey}
        ref={dock}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ width, height }}
        className={cn(
          "absolute left-1/2 top-0 z-50 -translate-x-1/2 overflow-hidden rounded-b-[20px] border border-t-0 border-border bg-card text-foreground",
          "transition-[width,height,box-shadow,border-color] duration-[420ms] motion-reduce:transition-none",
          EASE,
          open ? "shadow-[0_28px_60px_-24px_rgba(15,23,42,0.5)]" : "shadow-[0_8px_20px_-14px_rgba(15,23,42,0.45)] hover:border-brand-300",
          "animate-[gd-dock-in_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
        )}
      >
        <button
          ref={row}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={t`${flow.title}: details and picks`}
          className="mx-auto flex h-10 w-max min-w-0 max-w-[min(60vw,500px)] items-center gap-2 px-3 text-[12.5px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
        >
          <Cover flow={flow} />
          <span className="truncate font-semibold">{flow.title}</span>
          {flow.pageCount > 0 && (
            <span className={cn("shrink-0 tabular-nums max-sm:hidden", MUTED)}>
              <Plural value={flow.pageCount} one="# page" other="# pages" />
            </span>
          )}
          {summary.length > 0 && (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden max-md:hidden">
              {summary.map((v, i) => (
                <span key={`${i}-${v}`} className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-medium text-brand-700 animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
                  {v}
                </span>
              ))}
            </span>
          )}
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180", MUTED)} />
        </button>

        <div ref={body} inert={!open} className={cn("mx-auto w-[min(440px,calc(100vw-24px))] px-4 pb-4 pt-1 transition-opacity motion-reduce:transition-none", open ? "opacity-100 delay-150 duration-300" : "opacity-0 duration-100")}>
          <PdfDetails flow={flow} picks={picks} onEdit={onEdit} locked={locked} onSeePages={() => setPagesOpen(true)} onDone={close} shown={open} />
        </div>
      </div>
      <PdfPages
        file={file}
        title={flow.title}
        pageCount={flow.pageCount}
        open={pagesOpen}
        onClose={() => setPagesOpen(false)}
        onChange={() => {
          setPagesOpen(false)
          flow.openPicker()
        }}
        locked={locked}
      />
    </div>
  )
}

