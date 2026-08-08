import { createFileRoute } from "@tanstack/react-router"
import { PipelineScreen } from "@/components/redesign/screens/PipelineScreen"
import { isDockSlug, type DockSlug } from "@/components/redesign/screens/pipeline/plugins"
import { PageErrorDecisionDialog } from "@/components/pipeline/components/PageErrorDecisionDialog"
import { BookRunProvider, useBookRunStatus } from "@/hooks/use-book-run"

export interface PipelineSearch {
  step?: DockSlug
}

export const Route = createFileRoute("/redesign/pipeline/$label")({
  component: PipelineRoute,
  validateSearch: (search: Record<string, unknown>): PipelineSearch => {
    const step = search.step
    return typeof step === "string" && isDockSlug(step) ? { step } : {}
  },
})

function PipelineRoute() {
  const { label } = Route.useParams()
  const bookRun = useBookRunStatus(label)

  return (
    <BookRunProvider value={bookRun}>
      <PipelineScreen />
      <PageErrorDecisionDialog />
    </BookRunProvider>
  )
}
