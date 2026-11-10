import { SectioningPageCard } from "./SectioningPageCard"
import { PendingPageCard } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

export function SectioningPageGrid({
  label,
  pages,
  onOpen,
  aspect,
  hex,
  pending = false,
  pendingCount = 0,
}: {
  label: string
  pages: PipelinePage[]
  onOpen: (pageId: string) => void
  aspect: PageAspect
  hex: string
  pending?: boolean
  pendingCount?: number
}) {
  return (
    <div className={aspect.gridClass}>
      {pages.map((page) =>
        pending && page.sectionCount === 0 ? (
          <PendingPageCard
            key={`pending-${page.pageId}`}
            index={page.pageNumber - 1}
            hex={hex}
            label={label}
            pageId={page.pageId}
            pageNumber={page.pageNumber}
            textPreview
            aspect={aspect.ratio}
            fit={aspect.fitOf(page)}
          />
        ) : (
          <div key={page.pageId} className={pending ? "animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none" : undefined}>
            <SectioningPageCard label={label} page={page} onOpen={onOpen} aspect={aspect.ratio} fit={aspect.fitOf(page)} />
          </div>
        ),
      )}
      {Array.from({ length: pendingCount }, (_, index) => (
        <PendingPageCard key={`waiting-${pages.length + index}`} index={pages.length + index} hex={hex} textPreview aspect={aspect.ratio} numbered={false} />
      ))}
    </div>
  )
}
