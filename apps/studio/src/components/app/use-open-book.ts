import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { usePipelineUi } from "@/hooks/use-pipeline-ui"
import { isDockSlug } from "@/components/app/screens/pipeline/shared/dockSlugs"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"

const WORKSPACE_STEPS: ReadonlySet<string> = new Set(["book", "storyboard"])

export function hasNewPipelineScreen(step: string): boolean {
  return (
    WORKSPACE_STEPS.has(step) ||
    step === "preview" ||
    isDockSlug(step) ||
    isStepSettingsSlug(step)
  )
}

export function useOpenBook(): (label: string, step?: string) => void {
  const navigate = useNavigate()
  const [pipelineUi] = usePipelineUi()
  return useCallback(
    (label: string, step = "book") => {
      if (pipelineUi === "classic" || !hasNewPipelineScreen(step)) {
        void navigate({ to: "/books/$label/$step", params: { label, step } })
        return
      }
      if (WORKSPACE_STEPS.has(step)) {
        void navigate({ to: "/pipeline/$label", params: { label } })
        return
      }
      if (step === "preview") {
        void navigate({ to: "/pipeline/$label/preview", params: { label }, search: {} })
        return
      }
      void navigate({ to: "/pipeline/$label/$step", params: { label, step } })
    },
    [navigate, pipelineUi],
  )
}
