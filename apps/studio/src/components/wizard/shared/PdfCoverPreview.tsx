import { Loader2, BookOpen } from "lucide-react"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import {
  getPreviewPageLabel,
  usePdfPreviewPages,
} from "@/components/wizard/shared/usePdfPreviewPages"
import { PreviewShell } from "@/components/wizard/shared/PreviewShell"
import { PdfPageBadge } from "@/components/wizard/shared/PdfPageBadge"

export interface PreviewRange {
  startPage: number
  endPage: number
}

interface PdfCoverPreviewProps {
  file?: File | null
  width: number
  height: number
  /**
   * When set, pages inside the range are emphasised and pages outside it are
   * dimmed — a live preview of exactly which pages will be processed.
   */
  highlightRange?: PreviewRange | null
}

const BOOK_PREVIEW_LABEL = msg`Book preview`
const pdfPagePreviewMsg = msg`PDF page {pageLabel} preview`

function PdfCoverPlaceholder({ label }: { label: string }) {
  return (
    <PreviewShell label={label}>
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-6 px-6 py-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-white text-muted-foreground">
          <BookOpen className="h-7 w-7" />
        </div>
        <div className="max-w-[280px] text-center">
          <p className="text-base font-semibold text-foreground">
            <Trans>Book preview</Trans>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <Trans>Upload a PDF to preview its pages here.</Trans>
          </p>
        </div>
      </div>
    </PreviewShell>
  )
}

function PdfCoverCanvas({
  file,
  width,
  height,
  label,
  highlightRange,
}: {
  file: File
  width: number
  height: number
  label: string
  highlightRange?: PreviewRange | null
}) {
  const { i18n } = useLingui()
  const { pages, pageLabels, isLoading } = usePdfPreviewPages({
    file,
    mode: "all",
    width,
    height,
  })
  const ready = !isLoading && pages.length > 0

  return (
    <PreviewShell label={label} bodyClassName="relative overflow-y-auto">
      {!ready && (
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
      <div
        className={cn(
          "flex flex-col gap-3 p-3 transition-opacity duration-500",
          ready ? "opacity-100" : "opacity-0",
        )}
      >
        {pages.map((dataUrl, index) => {
          const pageNum = index + 1
          const printedLabel = getPreviewPageLabel(pageLabels, index)
          // No range → every page is active (unchanged behaviour). An open-ended
          // range is clamped to the last rendered page.
          const active =
            !highlightRange ||
            (pageNum >= highlightRange.startPage &&
              pageNum <= Math.min(highlightRange.endPage, pages.length))
          return (
            <div
              key={index}
              className={cn(
                "relative scroll-mt-3 transition-opacity",
                active ? "opacity-100" : "opacity-40",
              )}
            >
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
                  highlightRange && active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-[#e5e5e5]",
                )}
              />
              <PdfPageBadge pageNum={pageNum} printedLabel={printedLabel} />
            </div>
          )
        })}
      </div>
    </PreviewShell>
  )
}

export function PdfCoverPreview({ file, width, height, highlightRange }: PdfCoverPreviewProps) {
  const { i18n } = useLingui()
  const label = i18n._(BOOK_PREVIEW_LABEL)
  if (!file) return <PdfCoverPlaceholder label={label} />
  return (
    <PdfCoverCanvas
      file={file}
      width={width}
      height={height}
      label={label}
      highlightRange={highlightRange}
    />
  )
}
