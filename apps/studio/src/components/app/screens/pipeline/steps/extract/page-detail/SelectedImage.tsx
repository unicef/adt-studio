import { Trans } from "@lingui/react/macro"
import { MousePointerClick } from "lucide-react"
import { useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { CrossFade } from "@/components/app/screens/pipeline/steps/shared/page-inspector/CrossFade"
import { PageImageItem } from "./PageImageItem"
import type { BoxSelection } from "@/components/app/screens/pipeline/steps/shared/page-inspector/useBoxSelection"
import type { PageDetailData } from "./usePageDetailData"

export function SelectedImage({ label, data, selection, hint = false }: { label: string; data: PageDetailData; selection: BoxSelection; hint?: boolean }) {
  const entry = data.entries.find((candidate) => candidate.imageId === selection.selectedId)
  const structuredText = useBookStructuredTextAvailability(label)
  if (!entry && !hint) return null
  const { images } = data
  return (
    <CrossFade itemKey={entry?.imageId ?? "none"}>
      {entry ? (
        <div className="rounded-lg border bg-card">
          <PageImageItem
            label={label}
            entry={entry}
            cacheKey={images.cacheKey}
            onHover={selection.hover}
            segmenting={images.segmentingId === entry.imageId}
            showRecrop={!!data.pageSrc && !data.storyboardRunning}
            showSegment={structuredText && !data.storyboardRunning}
            onTogglePrune={images.togglePrune}
            onRecrop={images.openCrop}
            onSegment={images.segment.mutate}
          />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px] text-muted-foreground">
          <MousePointerClick className="size-3.5 shrink-0" />
          <Trans>Select an image to recrop, segment or filter it.</Trans>
        </p>
      )}
    </CrossFade>
  )
}
