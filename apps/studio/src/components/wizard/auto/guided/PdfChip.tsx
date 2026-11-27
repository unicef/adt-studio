import { useEffect, useRef, useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, FileUp } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../core/pdf/usePageThumb"
import type { UploadFlow } from "../../start/upload/useUploadFlow"

/**
 * The PDF being set up, at every step: a chip in the top bar (cover, name, pages) that opens its
 * pages, and "Change PDF", which picks another one (the flow starts again from Reading with it).
 */
/** How the PDF shows (dev lab): a chip, plain text, or a bigger cover with the name. */
export type PdfLook = "chip" | "text" | "cover"
/** How Change PDF shows (dev lab): icon and text, icon only, an outlined button, or only in the pages dialog. */
export type ChangeLook = "text" | "icon" | "outline" | "dialog"

export function PdfChip({ flow, look = "chip", change = "text" }: { flow: UploadFlow; look?: PdfLook; change?: ChangeLook }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  if (!flow.file) return null
  const pages = flow.pageCount > 0 && (
    <span className="shrink-0 tabular-nums text-muted-foreground max-sm:hidden">
      <Plural value={flow.pageCount} one="# page" other="# pages" />
    </span>
  )
  const cover = (big: boolean) => (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-muted ring-1 ring-border", big ? "h-9 w-[27px] rounded-[4px] shadow-[0_3px_8px_-4px_rgba(15,23,42,0.45)]" : "h-6 w-[18px] rounded-[3px]")}>
      {flow.cover ? <img src={flow.cover} alt="" className="size-full object-cover" /> : <FileText className="size-3 text-muted-foreground" />}
    </span>
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t`See the pages`}
        className={cn(
          "flex min-w-0 max-w-[280px] items-center gap-2 text-[12.5px] transition-colors max-sm:max-w-[150px]",
          look === "chip" && "h-8 rounded-full border border-border bg-background/60 py-1 pl-1 pr-3 hover:bg-muted",
          look === "text" && "h-8 rounded-md px-1.5 underline decoration-border underline-offset-4 hover:decoration-foreground/50",
          look === "cover" && "h-10 rounded-lg py-0.5 pl-0.5 pr-2 hover:bg-muted",
        )}
      >
        {look !== "text" && cover(look === "cover")}
        {look === "cover" ? (
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="max-w-full truncate font-semibold">{flow.title}</span>
            {pages}
          </span>
        ) : (
          <>
            <span className="truncate font-medium">{flow.title}</span>
            {look === "text" ? flow.pageCount > 0 && <span className="shrink-0 text-muted-foreground max-sm:hidden">·</span> : null}
            {pages}
          </>
        )}
      </button>
      {change !== "dialog" && (
        <button
          type="button"
          onClick={flow.openPicker}
          aria-label={change === "icon" ? t`Change PDF` : undefined}
          title={change === "icon" ? t`Change PDF` : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full text-[12.5px] font-medium transition-colors",
            change === "text" && "px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground",
            change === "icon" && "w-8 justify-center text-muted-foreground hover:bg-muted hover:text-foreground",
            change === "outline" && "px-3 ring-1 ring-border hover:bg-muted",
          )}
        >
          <FileUp className="size-3.5" />
          {change !== "icon" && (
            <span className="max-sm:sr-only">
              <Trans>Change PDF</Trans>
            </span>
          )}
        </button>
      )}
      <PdfPages
        file={flow.file}
        title={flow.title}
        pageCount={flow.pageCount}
        open={open}
        onClose={() => setOpen(false)}
        onChange={() => {
          setOpen(false)
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
function PdfPages({ file, title, pageCount, open, onClose, onChange }: { file: File; title: string; pageCount: number; open: boolean; onClose: () => void; onChange: () => void }) {
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
