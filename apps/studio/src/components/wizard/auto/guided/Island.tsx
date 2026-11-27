import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, FileText, FileUp, LayoutGrid, Pencil } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn, formatBytes } from "@/lib/utils"
import { usePageThumb } from "../../core/pdf/usePageThumb"
import type { UploadFlow } from "../../start/upload/useUploadFlow"
import type { ScreenId } from "./check/screens"

/** One pick the user made on Check: the screen it was made on, its name and the answer in words. */
export type IslandPick = { screen: ScreenId; title: MessageDescriptor; value: string }

const MUTED = "text-muted-foreground"
/** A quiet action in the panel: a soft pill that tints on hover and presses in. */
const PANEL_BUTTON =
  "group/btn flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-muted/70 px-3 text-[13px] font-medium transition-[background-color,transform] duration-150 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

function Cover({ flow, big }: { flow: UploadFlow; big?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-muted ring-1 ring-border", big ? "h-14 w-[42px] rounded-[6px] shadow-[0_6px_14px_-8px_rgba(15,23,42,0.5)]" : "h-6 w-[18px] rounded-[4px]")}>
      {flow.cover ? <img key={flow.cover} src={flow.cover} alt="" className="size-full object-cover animate-in fade-in duration-300 motion-reduce:animate-none" /> : <FileText className={cn(big ? "size-4" : "size-3", MUTED)} />}
    </span>
  )
}

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
export function Island({ flow, picks, onEdit }: { flow: UploadFlow; picks: IslandPick[]; onEdit: ((screen: ScreenId) => void) | null }) {
  const { t, i18n } = useLingui()
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
          <div className="flex items-center gap-3">
            <Cover flow={flow} big />
            <div className="min-w-0">
              <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{flow.title}</p>
              <p className={cn("text-[12.5px] tabular-nums", MUTED)}>
                {flow.pageCount > 0 && <Plural value={flow.pageCount} one="# page" other="# pages" />} · {formatBytes(file.size)}
              </p>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              className={PANEL_BUTTON}
              onClick={() => {
                close()
                setPagesOpen(true)
              }}
            >
              <LayoutGrid className="size-3.5 text-brand-600 transition-transform duration-200 group-hover/btn:scale-110 motion-reduce:transition-none" />
              <Trans>See pages</Trans>
            </button>
            <button
              type="button"
              className={PANEL_BUTTON}
              onClick={() => {
                close()
                flow.openPicker()
              }}
            >
              <FileUp className="size-3.5 text-brand-600 transition-transform duration-200 group-hover/btn:-translate-y-0.5 motion-reduce:transition-none" />
              <Trans>Change PDF</Trans>
            </button>
          </div>
          {picks.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className={cn("mb-1 text-[11.5px] font-semibold uppercase tracking-wide", MUTED)}>
                <Trans>Your picks</Trans>
              </p>
              <ul className="flex flex-col">
                {picks.map((p, i) => {
                  const title = i18n._(p.title)
                  const rowContent = (
                    <>
                      <span className={cn("w-[42%] shrink-0 text-[13px]", MUTED)}>{title}</span>
                      <span className="min-w-0 flex-1 text-[13.5px] font-medium">{p.value}</span>
                    </>
                  )
                  return (
                    <li key={p.screen} className={cn("transition-[opacity,transform] duration-300 motion-reduce:transition-none", open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0")} style={{ transitionDelay: open ? `${180 + i * 40}ms` : "0ms" }}>
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            close()
                            onEdit(p.screen)
                          }}
                          aria-label={t`Change ${title}: ${p.value}`}
                          className="group/pick -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
                        >
                          {rowContent}
                          <Pencil aria-hidden className="mt-0.5 size-3.5 shrink-0 -translate-x-1 text-brand-600 opacity-0 transition-[opacity,transform] duration-200 group-hover/pick:translate-x-0 group-hover/pick:opacity-100 group-focus-visible/pick:translate-x-0 group-focus-visible/pick:opacity-100 motion-reduce:transition-none" />
                        </button>
                      ) : (
                        <div className="flex items-start gap-2 py-1.5">{rowContent}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
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
      />
    </div>
  )
}

/** One page in the grid, drawn only once it scrolls into view (a long book stays quick to open). */
function GridPage({ file, page, root, onOpen }: { file: File; page: number; root: HTMLElement | null; onOpen: () => void }) {
  const { t } = useLingui()
  const ref = useRef<HTMLButtonElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { root, rootMargin: "200px" })
    io.observe(el)
    return () => io.disconnect()
  }, [root, seen])
  const src = usePageThumb(file, seen ? page : 0, 120)
  return (
    <button ref={ref} type="button" onClick={onOpen} aria-label={t`Page ${page}`} className="group flex flex-col items-center gap-1.5 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-brand-500">
      <span className="grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-[4px] bg-muted shadow-[0_4px_12px_-6px_rgba(15,23,42,0.35)] ring-1 ring-border transition-transform duration-150 group-hover:-translate-y-0.5 motion-reduce:transition-none">
        {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : <FileText className="size-4 text-muted-foreground/50" />}
      </span>
      <span className="text-[11.5px] font-semibold tabular-nums text-muted-foreground">{page}</span>
    </button>
  )
}

function BigPage({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 420)
  return (
    <div className="grid h-[min(62vh,620px)] place-items-center">
      {src ? <img key={src} src={src} alt="" className="max-h-[min(62vh,620px)] max-w-full rounded-md object-contain shadow-[0_24px_48px_-20px_rgba(15,23,42,0.6)] ring-1 ring-border" /> : <div className="h-full w-[60%] rounded-md bg-muted motion-safe:animate-pulse" />}
    </div>
  )
}

/** Every page of the PDF as a grid; a page opens large, with ← → to the others. */
export function PdfPages({ file, title, pageCount, open, onClose, onChange }: { file: File; title: string; pageCount: number; open: boolean; onClose: () => void; onChange: () => void }) {
  const { t } = useLingui()
  const [page, setPage] = useState<number | null>(null)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) setPage(null)
  }, [open])
  const go = (step: number) => page !== null && setPage(((page - 1 + step + pageCount) % pageCount) + 1)
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[90vh] max-w-[min(94vw,880px)] flex-col gap-3 rounded-[24px] p-4 sm:p-6"
        onKeyDown={(e) => {
          if (page === null) return
          if (e.key === "ArrowRight") go(1)
          else if (e.key === "ArrowLeft") go(-1)
        }}
      >
        <div className="flex items-center gap-2 pr-8">
          {page !== null && (
            <button type="button" onClick={() => setPage(null)} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              <Trans>All pages</Trans>
            </button>
          )}
          <DialogTitle className="min-w-0 truncate text-[17px] font-bold tracking-[-0.01em]">{page === null ? title : t`Page ${page}`}</DialogTitle>
        </div>
        <DialogDescription className={cn("text-[13px] text-muted-foreground", page !== null && "sr-only")}>
          <Plural value={pageCount} one="# page" other="# pages" />
        </DialogDescription>
        {page === null ? (
          <div ref={setScroller} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {pages.map((n) => (
                <GridPage key={n} file={file} page={n} root={scroller} onOpen={() => setPage(n)} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <BigPage file={file} page={page} />
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => go(-1)} aria-label={t`Previous page`} className="grid size-10 place-items-center rounded-full bg-muted transition-colors hover:bg-muted/70 active:scale-[0.96]">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                <Trans>
                  {page} of {pageCount}
                </Trans>
              </span>
              <button type="button" onClick={() => go(1)} aria-label={t`Next page`} className="grid size-10 place-items-center rounded-full bg-muted transition-colors hover:bg-muted/70 active:scale-[0.96]">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </>
        )}
        <div className="flex justify-end border-t border-border pt-3">
          <button type="button" onClick={onChange} className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium ring-1 ring-border transition-colors hover:bg-muted">
            <FileUp className="size-4" />
            <Trans>Change PDF</Trans>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
