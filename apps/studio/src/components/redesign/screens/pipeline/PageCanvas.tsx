import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ImageOff } from "lucide-react"
import { useSectionScreenshot } from "@/hooks/use-pages"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PageEmptyState } from "./PageEmptyState"
import { SectionSkeleton } from "./PageSkeleton"
import type { Viewport } from "./types"
import type { SectioningRun } from "./useSectioningRun"
import type { PipelinePage } from "./usePipelineState"

const CANVAS_WIDTH: Record<Viewport, string> = {
  desktop: "760px",
  tablet: "600px",
  mobile: "390px",
}

export interface PageCanvasProps {
  label: string
  page: PipelinePage
  viewport: Viewport
  sectioning: SectioningRun
  onOpenSectioning: () => void
}

function SectionFrame({
  label,
  page,
  sectionIndex,
  sectionType,
  viewport,
}: {
  label: string
  page: PipelinePage
  sectionIndex: number
  sectionType: string
  viewport: Viewport
}) {
  const { t } = useLingui()
  const screenshot = useSectionScreenshot(label, page.pageId, sectionIndex, {
    viewport,
    cacheKey: page.renderingVersion,
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
        {t`Section ${sectionIndex + 1} · ${sectionType}`}
      </div>
      {screenshot.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-muted-foreground">
          <ImageOff className="size-5" />
          <span className="text-[12.5px]">
            <Trans>No preview rendered for this section yet</Trans>
          </span>
        </div>
      ) : screenshot.data ? (
        <img
          src={screenshot.data}
          alt={t`Preview of section ${sectionIndex + 1}`}
          className="w-full rounded-lg border bg-card duration-200 animate-in fade-in-0"
        />
      ) : (
        <SectionSkeleton className="aspect-[10/13] w-full" />
      )}
    </div>
  )
}

/** The rendered page as the reader will see it, at the selected viewport width. */
export function PageCanvas({
  label,
  page,
  viewport,
  sectioning,
  onOpenSectioning,
}: PageCanvasProps) {
  const sections = page.sections.filter((s) => !s.isPruned)

  if (sections.length === 0) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center px-6 pb-24">
        <PageEmptyState
          label={label}
          page={page}
          sectioning={sectioning}
          onOpenSectioning={onOpenSectioning}
        />
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 w-full flex-1">
      <div className="flex justify-center px-6 pb-[190px] pt-6">
        <div
          className="flex flex-col gap-5 transition-[width] duration-200"
          style={{ width: CANVAS_WIDTH[viewport] }}
        >
          {page.missingCaptions > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              <Trans>This page has images without an alternative description.</Trans>
            </div>
          )}

          {sections.map((section) => (
            <SectionFrame
              key={section.sectionId}
              label={label}
              page={page}
              sectionIndex={section.sectionIndex}
              sectionType={section.sectionType}
              viewport={viewport}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
