import { memo } from "react"
import { AlignLeft, Image, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { PAGE_CARD_INTERACTIVE } from "../shared/pageCard"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { CardLeftOut } from "./prune-review/cards/cardModel"
import { CardTierOverlay } from "./prune-review/cards/CardTiers"

const CARD_FOCUS = cn(
  "has-[[data-card-open]:focus-visible]:border-[var(--chrome-hex)]",
  "has-[[data-card-open]:focus-visible]:shadow-[0_0_0_1px_var(--chrome-hex),0_0_0_4px_color-mix(in_srgb,var(--chrome-hex)_25%,transparent)]",
)

export const ExtractPageCard = memo(function ExtractPageCard({
  label,
  page,
  onOpen,
  aspect = 3 / 4,
  fit = "cover",
  hex = "#2563eb",
  leftOut,
}: {
  label: string
  page: PipelinePage
  onOpen: (pageId: string) => void
  aspect?: number
  fit?: "cover" | "contain"
  hex?: string
  leftOut?: CardLeftOut
}) {
  const { t } = useLingui()
  return (
    <div data-page-card={page.pageId} className={cn("relative flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left", PAGE_CARD_INTERACTIVE, CARD_FOCUS)}>
      <div className="relative overflow-hidden border-b">
        <PageThumb
          label={label}
          pageId={page.pageId}
          sectionIndex={null}
          className="w-full rounded-none border-0"
          style={{ aspectRatio: aspect }}
          fit={fit}
        />
        <CardTierOverlay leftOut={leftOut} hex={hex} />
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(page.pageId)}
            data-card-open
            aria-label={t`Open page ${page.pageNumber}`}
            className="cursor-pointer text-[12px] font-medium outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
          >
            <Trans>Page {page.pageNumber}</Trans>
          </button>
          <div className="flex items-center gap-2">
            {page.extractionWarning && (
              <span
                role="img"
                aria-label={t`No embedded text layer — text was recovered from the page image`}
                title={t`No embedded text layer — text was recovered from the page image`}
                className="relative z-10 flex items-center text-amber-600 dark:text-amber-400"
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
    </div>
  )
})
