import { useEffect, useRef, useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
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

const RENDER_WIDTH = 700
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
            "mx-auto flex w-full max-w-[640px] flex-col gap-3 p-4 transition-opacity duration-500",
            ready ? "opacity-100" : "opacity-0",
          )}
        >
          {interactive && (
            <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-1 border-b border-border/60 bg-[#fafafa]/90 px-4 py-2 text-center text-[11px] font-medium text-muted-foreground backdrop-blur">
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
            return (
              <div key={index}>
                {planStart && pageNum > 1 && (
                  <div className="mb-3 mt-1 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground tabular-nums">
                      <Trans>
                        Part {planStart.index + 1} · pages {planStart.window.startPage}–
                        {planStart.window.endPage}
                      </Trans>
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                {(() => {
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
                      {isExported && (
                        <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 shadow-sm dark:text-emerald-300">
                          <Trans>Exported</Trans>
                        </div>
                      )}
                    </>
                  )
                  const wrapperClass = cn(
                    "relative block w-full scroll-mt-4 rounded-md text-left transition-opacity",
                    active ? "opacity-100" : "opacity-40",
                    anchor === pageNum && "ring-2 ring-[#2b7fff] ring-offset-2",
                  )
                  return interactive ? (
                    <button
                      type="button"
                      ref={isActiveStart ? (el) => { activeRef.current = el } : undefined}
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
                    <div
                      ref={isActiveStart ? (el) => { activeRef.current = el } : undefined}
                      className={wrapperClass}
                    >
                      {pageInner}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </PreviewShell>
  )
}
