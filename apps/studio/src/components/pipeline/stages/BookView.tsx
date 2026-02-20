import { useCallback } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { getPipelineStages, STAGE_DESCRIPTIONS, isStageCompleted } from "../stage-config"
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
  const pipelineSteps = getPipelineStages()
  const { progress: stepRunProgress, queueRun } = useStepRun()
  const { apiKey, hasApiKey, azureKey, azureRegion } = useApiKey()
  const { data: stepStatusData } = useQuery({
    queryKey: ["books", bookLabel, "step-status"],
    queryFn: () => api.getStepStatus(bookLabel),
  })
  const completedSteps = stepStatusData?.steps ?? {}

  const handleRun = useCallback((slug: string) => {
    if (!hasApiKey) return
    // Prevent duplicate: don't queue if this stage is already running or queued
    const state = stepRunProgress.steps.get(slug)?.state
    if (state === "running" || state === "queued") return
    queueRun({ fromStep: slug, toStep: slug, apiKey, azure: { key: azureKey, region: azureRegion } })
  }, [hasApiKey, stepRunProgress.steps, apiKey, azureKey, azureRegion, queueRun])

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
                description={STAGE_DESCRIPTIONS[step.slug]}
                isRunning={isRunning}
                completed={isStageCompleted(step.slug, completedSteps)}
                showRunButton={step.slug !== "preview"}
                onRun={() => handleRun(step.slug)}
                disabled={!hasApiKey || isRunning}
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
