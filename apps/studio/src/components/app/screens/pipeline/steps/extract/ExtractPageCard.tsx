import { memo } from "react"
import { AlignLeft, Image, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export const ExtractPageCard = memo(function ExtractPageCard({
  label,
  page,
  onOpen,
  aspect = 3 / 4,
  fit = "cover",
}: {
  label: string
  page: PipelinePage
  onOpen: (pageId: string) => void
  aspect?: number
  fit?: "cover" | "contain"
}) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      onClick={() => onOpen(page.pageId)}
      data-page-card={page.pageId}
      aria-label={t`Open page ${page.pageNumber}`}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left",
        "transition-colors duration-200",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      )}
    >
      <PageThumb
        label={label}
        pageId={page.pageId}
        sectionIndex={null}
        className="w-full rounded-none border-0 border-b"
        style={{ aspectRatio: aspect }}
        fit={fit}
      />
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium">
            <Trans>Page {page.pageNumber}</Trans>
          </span>
          <div className="flex items-center gap-2">
            {page.extractionWarning && (
              <span
                role="img"
                aria-label={t`No embedded text layer — text was recovered from the page image`}
                title={t`No embedded text layer — text was recovered from the page image`}
                className="flex items-center text-amber-600 dark:text-amber-400"
              >
                <TriangleAlert className="size-2.5" aria-hidden="true" />
              </span>
            )}
            {page.wordCount > 0 && (
              <span className="flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                <AlignLeft className="size-2.5" />
                {page.wordCount}
              </span>
            )}
            {page.imageCount > 0 && (
              <span className="flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                <Image className="size-2.5" />
                {page.imageCount}
              </span>
            )}
          </div>
        </div>
        <p className="line-clamp-2 min-h-[2lh] text-[11px] leading-relaxed text-muted-foreground">
          {page.textPreview?.replace(/\n/g, " ") || t`No text extracted`}
        </p>
      </div>
    </button>
  )
})
