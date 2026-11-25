import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { usePageThumb } from "../../../../core/pdf/usePageThumb"

function Thumb({ file, page, onOpen, small }: { file: File; page: number; onOpen: () => void; small?: boolean }) {
  const { t } = useLingui()
  const src = usePageThumb(file, page, 56)
  if (small)
    return (
      <button type="button" onClick={onOpen} className="group inline-flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2.5 text-[13.5px] font-medium text-brand-700 transition-colors hover:bg-brand-50">
        <span className="grid h-[34px] w-[26px] place-items-center overflow-hidden rounded-[3px] bg-muted ring-1 ring-border">{src ? <img src={src} alt="" className="max-h-full max-w-full" /> : <FileText className="size-3 text-muted-foreground/60" />}</span>
        <Trans>See page {page}</Trans>
      </button>
    )
  return (
    <button type="button" onClick={onOpen} aria-label={t`Show page ${page} larger`} className="group flex shrink-0 flex-col items-center gap-1 rounded-lg p-0.5 outline-offset-2">
      <span className="grid h-[74px] w-[56px] place-items-center overflow-hidden rounded-[5px] bg-muted shadow-[0_4px_12px_-6px_rgba(15,23,42,0.4)] ring-1 ring-border transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_10px_20px_-8px_rgba(15,23,42,0.45)] group-hover:ring-brand-300 motion-reduce:transition-none">
        {src ? <img src={src} alt="" className="max-h-full max-w-full animate-in fade-in duration-200" /> : <FileText className="size-4 text-muted-foreground/60" />}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground group-hover:text-foreground">
        <Trans>p. {page}</Trans>
      </span>
    </button>
  )
}

function Big({ file, page }: { file: File; page: number }) {
  const src = usePageThumb(file, page, 420)
  return (
    <div className="grid h-[min(68vh,640px)] place-items-center">
      {src ? <img key={src} src={src} alt="" className="max-h-[min(68vh,640px)] max-w-full rounded-md object-contain shadow-[0_24px_48px_-20px_rgba(15,23,42,0.6)] ring-1 ring-border animate-in fade-in duration-200" /> : <div className="h-full w-[70%] rounded-md bg-muted motion-safe:animate-pulse" />}
    </div>
  )
}

/**
 * A page shown large, with the other pages a step away (← → or the arrows). `page` null is closed.
 */
export function PageViewer({ file, pages, page, onPage, label }: { file: File; pages: number[]; page: number | null; onPage: (page: number | null) => void; label?: string }) {
  const { t } = useLingui()
  const at = page === null ? -1 : pages.indexOf(page)
  const go = (step: number) => onPage(pages[(at + step + pages.length) % pages.length]!)
  return (
    <Dialog open={page !== null} onOpenChange={(o) => !o && onPage(null)}>
      <DialogContent className="max-w-[min(92vw,720px)] gap-3 rounded-[24px] p-4 sm:p-6" onKeyDown={(e) => (e.key === "ArrowRight" ? go(1) : e.key === "ArrowLeft" ? go(-1) : undefined)}>
        <DialogTitle className="text-[17px] font-bold tracking-[-0.01em]">
          <Trans>Page {page}</Trans>
        </DialogTitle>
        <DialogDescription className="sr-only">{label ?? t`Pages that show it`}</DialogDescription>
        {page !== null && <Big file={file} page={page} />}
        {pages.length > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => go(-1)} aria-label={t`Previous page`} className="grid size-10 place-items-center rounded-full bg-muted transition-colors hover:bg-muted/70 active:scale-[0.96]">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
              <Trans>
                {at + 1} of {pages.length}
              </Trans>
            </span>
            <button type="button" onClick={() => go(1)} aria-label={t`Next page`} className="grid size-10 place-items-center rounded-full bg-muted transition-colors hover:bg-muted/70 active:scale-[0.96]">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Evidence pages as given: unique, in page order, at most four. */
export const evidenceList = (pages: number[]) => [...new Set(pages)].sort((a, b) => a - b).slice(0, 4)

/**
 * The pages that show what the assistant says, as small real page images. Tapping one opens it
 * large, with the others a step away.
 */
export function PageStrip({ file, pages, label, className, small }: { file: File | null | undefined; pages: number[]; label?: string; className?: string; small?: boolean }) {
  const { t } = useLingui()
  const [open, setOpen] = useState<number | null>(null)
  const list = evidenceList(pages)
  if (!file || list.length === 0) return null
  return (
    <>
      <div role="group" aria-label={label ?? t`Pages that show it`} className={cn("flex flex-wrap gap-1.5", className)}>
        {list.map((p) => (
          <Thumb key={p} file={file} page={p} small={small} onOpen={() => setOpen(p)} />
        ))}
      </div>
      <PageViewer file={file} pages={list} page={open} onPage={setOpen} label={label} />
    </>
  )
}
