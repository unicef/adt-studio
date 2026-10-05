import { ExtractPageCard } from "./ExtractPageCard"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export function ExtractPageGrid({
  label,
  pages,
  onOpen,
}: {
  label: string
  pages: PipelinePage[]
  onOpen: (pageId: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {pages.map((page) => (
        <ExtractPageCard key={page.pageId} label={label} page={page} onOpen={onOpen} />
      ))}
    </div>
  )
}
