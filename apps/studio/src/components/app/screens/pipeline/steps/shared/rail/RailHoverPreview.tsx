import { useMemo } from "react"
import { usePages } from "@/hooks/use-pages"
import { PageHoverPreview } from "@/components/app/screens/pipeline/rail/PageHoverPreview"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export function RailHoverPreview({ label, pageId }: { label: string; pageId: string }) {
  const { data } = usePages(label, { enabled: false })
  const page = useMemo<PipelinePage | null>(() => {
    const summary = data?.find((candidate) => candidate.pageId === pageId)
    if (!summary) return null
    return {
      ...summary,
      captionCount: summary.captionCount ?? 0,
      decorativeCount: summary.decorativeCount ?? 0,
      uncaptionedCount: summary.uncaptionedCount ?? 0,
      missingCaptions: summary.hasCaptioning ? (summary.uncaptionedCount ?? 0) : summary.imageCount,
      isDiscarded: summary.sectionCount > 0 && summary.prunedSections.length >= summary.sectionCount,
    }
  }, [data, pageId])
  if (!page) return null
  return <PageHoverPreview label={label} page={page} outdated={false} />
}
