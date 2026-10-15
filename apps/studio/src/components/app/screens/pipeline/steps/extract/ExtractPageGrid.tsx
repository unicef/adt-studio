import { ExtractPageCard } from "./ExtractPageCard"
import { PendingPageCard } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

export function ExtractPageGrid({
  label,
  pages,
  onOpen,
  pendingCount = 0,
  hex,
}: {
  label: string
  pages: PipelinePage[]
  onOpen: (pageId: string) => void
  pendingCount?: number
  hex?: string
}) {
  const aspect = usePageAspect(label, pages)
  return (
    <div className={aspect.gridClass}>
      {pages.map((page) => (
        <div key={page.pageId} className={pendingCount > 0 ? "animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none" : undefined}>
          <ExtractPageCard label={label} page={page} onOpen={onOpen} aspect={aspect.ratio} fit={aspect.fitOf(page)} />
        </div>
      ))}
      {Array.from({ length: pendingCount }, (_, index) => (
        <PendingPageCard key={`pending-${pages.length + index}`} index={pages.length + index} hex={hex ?? "#2563eb"} textPreview aspect={aspect.ratio} numbered={false} />
      ))}
    </div>
  )
}
