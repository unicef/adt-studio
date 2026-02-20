import { useCallback } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { STEPS, STEP_DESCRIPTIONS, isStepCompleted } from "../StepSidebar"
import { useStepRun } from "@/hooks/use-step-run"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { StageRunCard } from "../StageRunCard"

interface ViewProps {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}


export function BookView({ bookLabel }: ViewProps) {
  const pipelineSteps = STEPS.filter((s) => s.slug !== "book")
  const { progress: stepRunProgress, startRun, reset, setSseEnabled } = useStepRun()
  const { apiKey, hasApiKey, azureKey, azureRegion } = useApiKey()
  const queryClient = useQueryClient()
  const { data: stepStatusData } = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
  })
  const completedSteps = stepStatusData?.steps ?? {}

  const handleRun = useCallback(async (slug: string) => {
    if (!hasApiKey || stepRunProgress.isRunning) return
    try {
      startRun(slug, slug)
      setSseEnabled(true)
      await api.runSteps(bookLabel, apiKey, { fromStep: slug, toStep: slug }, { key: azureKey, region: azureRegion })
      queryClient.removeQueries({ queryKey: ["books", bookLabel, "pages"] })
      queryClient.removeQueries({ queryKey: ["books", bookLabel] })
      if (slug === "text-and-speech") {
        queryClient.removeQueries({ queryKey: ["books", bookLabel, "tts"] })
      }
    } catch {
      setSseEnabled(false)
      reset()
    }
  }, [bookLabel, apiKey, hasApiKey, azureKey, azureRegion, stepRunProgress.isRunning, startRun, reset, setSseEnabled, queryClient])

  return (
    <div className="flex flex-col items-start max-w-xl">
      {pipelineSteps.map((step, index) => {
        const isLast = index === pipelineSteps.length - 1
        const stepProgress = stepRunProgress.steps.get(step.slug)
        const ringState = stepProgress?.state ?? "idle"
        const isRunning = ringState === "running" || ringState === "queued"
        return (
          <div key={step.slug} className="w-full">
            <Link
              to="/books/$label/$step"
              params={{ label: bookLabel, step: step.slug }}
              className="block"
            >
              <StageRunCard
                stageSlug={step.slug}
                description={STEP_DESCRIPTIONS[step.slug]}
                isRunning={isRunning}
                completed={isStepCompleted(step.slug, completedSteps)}
                showRunButton={step.slug !== "preview"}
                onRun={() => handleRun(step.slug)}
                disabled={!hasApiKey || stepRunProgress.isRunning}
              />
            </Link>
            {!isLast && (
              <div className={`flex flex-col items-center w-8 ml-3 mb-1 ${step.textColor} opacity-40`}>
                <div className="w-1.5 h-2 bg-current" />
                <svg viewBox="0 0 12 8" className="w-3 h-2" fill="currentColor">
                  <path d="M6 8L0 0h12z" />
                </svg>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
