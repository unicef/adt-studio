import { ExtractPageCard } from "./ExtractPageCard"
import { PendingPageCard } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { CardLeftOut } from "./prune-review/cards/cardModel"

export function ExtractPageGrid({
  label,
  pages,
  onOpen,
  aspect,
  pendingCount = 0,
  hex,
  leftOut,
}: {
  label: string
  pages: PipelinePage[]
  onOpen: (pageId: string) => void
  aspect: PageAspect
  pendingCount?: number
  hex?: string
  leftOut?: ReadonlyMap<string, CardLeftOut>
}) {
  return (
    <div className={aspect.gridClass}>
      {pages.map((page) => (
        <div key={page.pageId} className={pendingCount > 0 ? "animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none" : undefined}>
          <ExtractPageCard label={label} page={page} onOpen={onOpen} aspect={aspect.ratio} fit={aspect.fitOf(page)} hex={hex} leftOut={leftOut?.get(page.pageId)} />
        </div>
      ))}
      {Array.from({ length: pendingCount }, (_, index) => (
        <PendingPageCard key={`pending-${pages.length + index}`} index={pages.length + index} hex={hex ?? "#2563eb"} textPreview aspect={aspect.ratio} numbered={false} />
      ))}
    </div>
  )
}
