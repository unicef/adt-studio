import { useEffect, useRef, useState } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, FileText, FileUp, LayoutGrid, Pencil } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, formatBytes } from "@/lib/utils"
import { usePageThumb } from "../../core/pdf/usePageThumb"
import type { UploadFlow } from "../../start/upload/useUploadFlow"
import type { ScreenId } from "./check/screens"

/** One pick the user made on Check: the screen it was made on, its name and the answer in words. */
export type IslandPick = { screen: ScreenId; title: MessageDescriptor; value: string }

const ISLAND = "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
const ISLAND_MUTED = "text-white/60 dark:text-neutral-900/60"
const ISLAND_BUTTON = "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-medium transition-colors hover:bg-white/20 dark:bg-neutral-900/10 dark:hover:bg-neutral-900/20"

function Cover({ flow, big }: { flow: UploadFlow; big?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-white/15 dark:bg-neutral-900/10", big ? "h-14 w-[42px] rounded-[6px]" : "h-6 w-[18px] rounded-[4px]")}>
      {flow.cover ? <img src={flow.cover} alt="" className="size-full object-cover" /> : <FileText className={cn(big ? "size-4" : "size-3", "opacity-60")} />}
    </span>
  )
}

/**
 * The island in the middle of the top bar: the PDF being set up (cover, name, pages) and, on wide
 * windows, the first picks in a line. It opens (no animation) to the PDF's details, its pages and
 * Change PDF, and every pick so far; a pick opens its Check screen again (`onEdit`, null once the
 * book is being set up). Nothing shows before a PDF is chosen.
 */
export function Island({ flow, picks, onEdit }: { flow: UploadFlow; picks: IslandPick[]; onEdit: ((screen: ScreenId) => void) | null }) {
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)
  if (!flow.file) return null
  const file = flow.file
  const summary = picks.slice(0, 3).map((p) => p.value).join(" · ")
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t`${flow.title}: details and picks`}
            className={cn("flex h-9 min-w-0 max-w-[min(60vw,480px)] items-center gap-2 rounded-full py-1 pl-1.5 pr-3 text-[12.5px] shadow-[0_6px_18px_-8px_rgba(15,23,42,0.55)]", ISLAND)}
          >
            <Cover flow={flow} />
            <span className="truncate font-semibold">{flow.title}</span>
            {flow.pageCount > 0 && (
              <span className={cn("shrink-0 tabular-nums max-sm:hidden", ISLAND_MUTED)}>
                <Plural value={flow.pageCount} one="# page" other="# pages" />
              </span>
            )}
            {summary && <span className={cn("min-w-0 truncate max-md:hidden", ISLAND_MUTED)}>· {summary}</span>}
            <ChevronDown className={cn("size-3.5 shrink-0", ISLAND_MUTED)} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" sideOffset={8} className={cn("w-[min(92vw,420px)] rounded-[22px] border-0 p-4 shadow-2xl data-[state=closed]:animate-none data-[state=open]:animate-none", ISLAND)}>
          <div className="flex items-center gap-3">
            <Cover flow={flow} big />
            <div className="min-w-0">
              <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{flow.title}</p>
              <p className={cn("text-[12.5px] tabular-nums", ISLAND_MUTED)}>
                {flow.pageCount > 0 && <Plural value={flow.pageCount} one="# page" other="# pages" />} · {formatBytes(file.size)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={ISLAND_BUTTON}
              onClick={() => {
                setOpen(false)
                setPagesOpen(true)
              }}
            >
              <LayoutGrid className="size-3.5" />
              <Trans>See pages</Trans>
            </button>
            <button
              type="button"
              className={ISLAND_BUTTON}
              onClick={() => {
                setOpen(false)
                flow.openPicker()
              }}
            >
              <FileUp className="size-3.5" />
              <Trans>Change PDF</Trans>
            </button>
          </div>
          {picks.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3 dark:border-neutral-900/10">
              <p className={cn("mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide", ISLAND_MUTED)}>
                <Trans>Your picks</Trans>
              </p>
              <ul className="flex flex-col">
                {picks.map((p) => {
                  const title = i18n._(p.title)
                  const row = (
                    <>
                      <span className={cn("w-[42%] shrink-0 text-[13px]", ISLAND_MUTED)}>{title}</span>
                      <span className="min-w-0 flex-1 text-[13.5px] font-medium">{p.value}</span>
                    </>
                  )
                  return (
                    <li key={p.screen}>
                      {onEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onEdit(p.screen)
                          }}
                          aria-label={t`Change ${title}: ${p.value}`}
                          className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/10 dark:hover:bg-neutral-900/10"
                        >
                          {row}
                          <Pencil aria-hidden className={cn("mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100", ISLAND_MUTED)} />
                        </button>
                      ) : (
                        <div className="flex items-start gap-2 py-1.5">{row}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </PopoverContent>
      </Popover>
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
    </>
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
