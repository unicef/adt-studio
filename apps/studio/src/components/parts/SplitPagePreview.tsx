import { useEffect, useRef, useState } from "react"
import { Loader2, AlertTriangle, ZoomIn, X, ChevronLeft, ChevronRight } from "lucide-react"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import {
  getPreviewPageLabel,
  usePdfPreviewPages,
} from "@/components/wizard/shared/usePdfPreviewPages"
import { PreviewShell } from "@/components/wizard/shared/PreviewShell"
import { PdfPageBadge } from "@/components/wizard/shared/PdfPageBadge"
import { getSourcePdfUrl, type PageRange } from "../../api/client"

const RENDER_WIDTH = 640
const pdfPagePreviewMsg = msg`PDF page {pageLabel} preview`

function inAnyRange(page: number, ranges: PageRange[] | undefined): boolean {
  return (ranges ?? []).some((r) => page >= r.startPage && page <= r.endPage)
}

/**
 * Read-only PDF preview that renders every source page and highlights the page
 * range currently selected in the export controls. Pages outside the active
 * range are dimmed; already-exported ranges are shaded; equal-parts plan
 * windows get a labelled divider so split boundaries are visible at a glance.
 */
export function SplitPagePreview({
  bookLabel,
  startPage,
  endPage,
  plan,
  exported,
  onSelectRange,
}: {
  bookLabel: string
  startPage: number
  endPage: number
  plan: PageRange[] | null
  exported: PageRange[] | undefined
  /** When provided, pages become clickable to set the range (click a start
   *  page, then an end page). */
  onSelectRange?: (start: number, end: number) => void
}) {
  const { t, i18n } = useLingui()
  const { pages, pageLabels, isLoading, error } = usePdfPreviewPages({
    src: getSourcePdfUrl(bookLabel),
    mode: "all",
    width: RENDER_WIDTH,
  })
  const ready = !isLoading && pages.length > 0
  const interactive = typeof onSelectRange === "function"
  const [anchor, setAnchor] = useState<number | null>(null)
  // Index (0-based) of the page shown in the enlarged lightbox, or null.
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    if (zoom === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null)
      else if (e.key === "ArrowLeft") setZoom((z) => (z === null ? z : Math.max(0, z - 1)))
      else if (e.key === "ArrowRight") setZoom((z) => (z === null ? z : Math.min(pages.length - 1, z + 1)))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [zoom, pages.length])

  const onPageClick = (pageNum: number) => {
    if (!onSelectRange) return
    if (anchor === null) {
      setAnchor(pageNum)
      onSelectRange(pageNum, pageNum)
    } else {
      onSelectRange(Math.min(anchor, pageNum), Math.max(anchor, pageNum))
      setAnchor(null)
    }
  }

  // Scroll the first page of the active range into view when it changes.
  const activeRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [startPage, ready])

  // Page (1-based) → the plan window that starts on it, for the divider label.
  const planStartByPage = new Map<number, { window: PageRange; index: number }>()
  ;(plan ?? []).forEach((window, index) => {
    planStartByPage.set(window.startPage, { window, index })
  })

  return (
    <PreviewShell label={t`Split preview`} bodyClassName="relative overflow-y-auto">
      {!ready && !error && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#f0f0f0]"
          aria-hidden
        >
          <Loader2 className="h-8 w-8 animate-spin text-[#737373]" aria-hidden />
          <span className="sr-only">
            <Trans>Loading preview</Trans>
          </span>
        </div>
      )}

      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          <p className="max-w-[320px] text-sm text-muted-foreground">
            <Trans>Couldn't load the PDF preview. The pages can still be split using the controls.</Trans>
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-2 content-start gap-3 p-4 transition-opacity duration-500 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          {interactive && (
            <div className="sticky top-0 z-20 col-span-full -mx-4 -mt-4 mb-1 border-b border-border/60 bg-[#fafafa]/90 px-4 py-2 text-center text-[11px] font-medium text-muted-foreground backdrop-blur">
              {anchor === null ? (
                <Trans>Click a start page, then an end page to set the range.</Trans>
              ) : (
                <Trans>Now click the end page.</Trans>
              )}
            </div>
          )}
          {pages.map((dataUrl, index) => {
            const pageNum = index + 1
            // The split operates on physical page positions, so the badge shows
            // the physical page number to match the From/To controls. The PDF's
            // printed page label (e.g. "iii", "A") is shown only as a secondary
            // tag when it differs, so the two numbering schemes don't get mixed up.
            const printedLabel = getPreviewPageLabel(pageLabels, index)
            const active = pageNum >= startPage && pageNum <= endPage
            const isExported = inAnyRange(pageNum, exported)
            const planStart = planStartByPage.get(pageNum)
            const isActiveStart = active && pageNum === startPage
            const pageInner = (
              <>
                <img
                  src={dataUrl}
                  loading="lazy"
                  decoding="async"
                  alt={i18n._(
                    pdfPagePreviewMsg.id,
                    { pageLabel: pageNum },
                    { message: pdfPagePreviewMsg.message },
                  )}
                  className={cn(
                    "h-auto w-full rounded-md border bg-white shadow-sm",
                    active ? "border-primary ring-2 ring-primary/40" : "border-[#e5e5e5]",
                  )}
                />
                <PdfPageBadge pageNum={pageNum} printedLabel={printedLabel} />
                {planStart && (
                  <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-part/40 bg-part/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-part shadow-sm">
                    <Trans>Part {planStart.index + 1}</Trans>
                  </div>
                )}
                {isExported && (
                  <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 shadow-sm dark:text-emerald-300">
                    <Trans>Exported</Trans>
                  </div>
                )}
              </>
            )
            const wrapperClass = cn(
              "relative block w-full rounded-md text-left transition-opacity",
              active ? "opacity-100" : "opacity-40",
              anchor === pageNum && "ring-2 ring-part ring-offset-2",
            )
            return (
              <div
                key={index}
                ref={isActiveStart ? (el) => { activeRef.current = el } : undefined}
                className="group relative scroll-mt-4"
              >
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onPageClick(pageNum)}
                    aria-pressed={active}
                    aria-label={t`Page ${pageNum}`}
                    className={cn(
                      wrapperClass,
                      "cursor-pointer hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    {pageInner}
                  </button>
                ) : (
                  <div className={wrapperClass}>{pageInner}</div>
                )}
                <button
                  type="button"
                  onClick={() => setZoom(index)}
                  aria-label={t`View page ${pageNum} larger`}
                  className="absolute right-2 top-2 z-20 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity duration-150 hover:bg-black/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white group-hover:opacity-100"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {zoom !== null && pages[zoom] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={i18n._(pdfPagePreviewMsg.id, { pageLabel: zoom + 1 }, { message: pdfPagePreviewMsg.message })}
          onClick={() => setZoom(null)}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
        >
          <img
            src={pages[zoom]}
            alt={i18n._(pdfPagePreviewMsg.id, { pageLabel: zoom + 1 }, { message: pdfPagePreviewMsg.message })}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-md shadow-2xl"
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoom(null) }}
            aria-label={t`Close`}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-foreground shadow-lg transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-4 w-4" />
          </button>
          {zoom > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setZoom(zoom - 1) }}
              aria-label={t`Previous page`}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-foreground shadow-lg transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {zoom < pages.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setZoom(zoom + 1) }}
              aria-label={t`Next page`}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-foreground shadow-lg transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium tabular-nums text-white">
            <Trans>Page {zoom + 1} of {pages.length}</Trans>
          </span>
        </div>
      )}
    </PreviewShell>
  )
}
