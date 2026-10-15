import { SectioningPageCard } from "./SectioningPageCard"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

export function SectioningPageGrid({
  label,
  pages,
  onOpen,
}: {
  label: string
  pages: PipelinePage[]
  onOpen: (pageId: string) => void
}) {
  const aspect = usePageAspect(label, pages)
  return (
    <div className={aspect.gridClass}>
      {pages.map((page) => (
        <SectioningPageCard key={page.pageId} label={label} page={page} onOpen={onOpen} aspect={aspect.ratio} fit={aspect.fitOf(page)} />
      ))}
    </div>
  )
}
