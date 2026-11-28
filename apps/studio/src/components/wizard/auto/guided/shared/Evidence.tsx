import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { usePageThumb } from "../../../core/pdf/usePageThumb"
import { useReturnFocus } from "./useReturnFocus"

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
  const returnFocus = useReturnFocus(page !== null)
  return (
    <Dialog open={page !== null} onOpenChange={(o) => !o && onPage(null)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-w-[min(92vw,720px)] gap-3 rounded-[24px] p-4 sm:p-6" onKeyDown={(e) => (e.key === "ArrowRight" ? go(1) : e.key === "ArrowLeft" ? go(-1) : undefined)}>
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
