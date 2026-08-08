import { createFileRoute } from "@tanstack/react-router"
import { PipelineScreen } from "@/components/redesign/screens/PipelineScreen"
import { isDockSlug, type DockSlug } from "@/components/redesign/screens/pipeline/plugins"

export interface PipelineSearch {
  step?: DockSlug
}

export const Route = createFileRoute("/redesign/pipeline/$label")({
  component: PipelineScreen,
  validateSearch: (search: Record<string, unknown>): PipelineSearch => {
    const step = search.step
    return typeof step === "string" && isDockSlug(step) ? { step } : {}
  },
})
