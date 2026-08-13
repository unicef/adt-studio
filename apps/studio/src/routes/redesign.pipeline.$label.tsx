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
  /** Reading the packaged book; carries the section the storyboard was showing. */
  preview?: boolean
  previewSection?: string
}

export const Route = createFileRoute("/redesign/pipeline/$label")({
  component: PipelineRoute,
  validateSearch: (search: Record<string, unknown>): PipelineSearch => {
    const { step, settings, tab, preview, previewSection } = search
    return {
      ...(typeof step === "string" && isDockSlug(step) ? { step } : {}),
      ...(typeof settings === "string" && isStepSettingsSlug(settings) ? { settings } : {}),
      ...(typeof tab === "string" ? { tab } : {}),
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
