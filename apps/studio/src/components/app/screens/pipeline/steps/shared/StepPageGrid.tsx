import type { ReactNode } from "react"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { StepPageCard, type StepPageStat } from "./StepPageCard"

export interface StepPageCardContent {
  stats?: readonly StepPageStat[]
  status?: ReactNode
  preview?: ReactNode
  failed?: boolean
  waiting?: boolean
  selected?: boolean
}

export function StepPageGrid({
  label,
  pages,
  aspect,
  onOpen,
  cardOf,
}: {
  label: string
  pages: readonly PipelinePage[]
  aspect: PageAspect
  onOpen: (pageId: string) => void
  cardOf: (page: PipelinePage) => StepPageCardContent
}) {
  return (
    <div className={aspect.gridClass}>
      {pages.map((page) => (
        <div key={page.pageId} className="animate-in fade-in duration-300 motion-reduce:animate-none">
          <StepPageCard
            label={label}
            pageId={page.pageId}
            pageNumber={page.pageNumber}
            onOpen={onOpen}
            aspect={aspect.ratio}
            fit={aspect.fitOf(page)}
            {...cardOf(page)}
          />
        </div>
      ))}
    </div>
  )
}
