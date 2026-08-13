import { createFileRoute } from "@tanstack/react-router"
import { PipelineScreen } from "@/components/redesign/screens/PipelineScreen"
import { isDockSlug, type DockSlug } from "@/components/redesign/screens/pipeline/shared/plugins"
import {
  isStepSettingsSlug,
  type StepSettingsSlug,
} from "@/components/redesign/screens/pipeline/settings/slugs"
import { PageErrorDecisionDialog } from "@/components/pipeline/components/PageErrorDecisionDialog"
import { BookRunProvider, useBookRunStatus } from "@/hooks/use-book-run"

export interface PipelineSearch {
  step?: DockSlug
  settings?: StepSettingsSlug
  tab?: string
  /** Page the canvas is showing. Absent means the first page of the book. */
  page?: string
  /** Reading the packaged book; carries the section the storyboard was showing. */
  preview?: boolean
  previewSection?: string
}

export const Route = createFileRoute("/redesign/pipeline/$label")({
  component: PipelineRoute,
  validateSearch: (search: Record<string, unknown>): PipelineSearch => {
    const { step, settings, tab, page, preview, previewSection } = search
    return {
      ...(typeof step === "string" && isDockSlug(step) ? { step } : {}),
      ...(typeof settings === "string" && isStepSettingsSlug(settings) ? { settings } : {}),
      ...(typeof tab === "string" ? { tab } : {}),
      ...(typeof page === "string" && page ? { page } : {}),
      ...(preview === true || preview === "true" ? { preview: true } : {}),
      ...(typeof previewSection === "string" ? { previewSection } : {}),
    }
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
