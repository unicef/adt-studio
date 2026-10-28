import { SectioningPageCard } from "./SectioningPageCard"
import { PendingPageCard } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

export function SectioningPageGrid({
  label,
  pages,
  onOpen,
  aspect,
  live,
}: {
  label: string
  pages: PipelinePage[]
  onOpen: (pageId: string) => void
  aspect: PageAspect
  live?: { hex: string; pending: boolean }
}) {
  return (
    <div className={aspect.gridClass}>
      {pages.map((page) =>
        !live ? (
          <SectioningPageCard key={page.pageId} label={label} page={page} onOpen={onOpen} aspect={aspect.ratio} fit={aspect.fitOf(page)} />
        ) : live.pending && page.sectionCount === 0 ? (
          <PendingPageCard
            key={`pending-${page.pageId}`}
            index={page.pageNumber - 1}
            hex={live.hex}
            label={label}
            pageId={page.pageId}
            pageNumber={page.pageNumber}
            textPreview
            aspect={aspect.ratio}
          />
        ) : (
          <div key={page.pageId} className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
            <SectioningPageCard label={label} page={page} onOpen={onOpen} aspect={aspect.ratio} fit={aspect.fitOf(page)} />
          </div>
        ),
      )}
    </div>
  )
}
