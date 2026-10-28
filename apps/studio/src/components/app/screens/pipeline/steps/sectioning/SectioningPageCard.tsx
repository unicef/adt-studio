import { memo } from "react"
import { EyeOff, Layers, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { PAGE_CARD_INTERACTIVE } from "../shared/pageCard"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export const SectioningPageCard = memo(function SectioningPageCard({
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
  const prunedCount = page.prunedSections.length
  return (
    <button
      type="button"
      onClick={() => onOpen(page.pageId)}
      data-page-card={page.pageId}
      aria-label={t`Open page ${page.pageNumber}`}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left",
        PAGE_CARD_INTERACTIVE,
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
            <span
              title={t`${plural(page.sectionCount, { one: "# section", other: "# sections" })}`}
              className="flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
            >
              <Layers className="size-2.5" />
              {page.sectionCount}
            </span>
            {prunedCount > 0 && (
              <span
                title={t`${prunedCount} sections excluded from render`}
                className="flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-amber-600 dark:text-amber-400"
              >
                <EyeOff className="size-2.5" />
                {prunedCount}
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
