import { useCallback } from "react"
import { Link } from "@tanstack/react-router"
import { getPipelineStages, STAGE_DESCRIPTIONS } from "../stage-config"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"

interface ViewProps {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}


export function BookView({ bookLabel }: ViewProps) {
  const pipelineSteps = getPipelineStages()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey, azureKey, azureRegion } = useApiKey()

  const handleRun = useCallback((slug: string) => {
    if (!hasApiKey) return
    // Prevent duplicate: don't queue if this stage is already running or queued
    const state = stageState(slug)
    if (state === "running" || state === "queued") return
    queueRun({ fromStage: slug, toStage: slug, apiKey, azure: { key: azureKey, region: azureRegion } })
  }, [hasApiKey, stageState, apiKey, azureKey, azureRegion, queueRun])

  return (
    <div className="flex flex-col items-start max-w-xl">
      {pipelineSteps.map((step, index) => {
        const isLast = index === pipelineSteps.length - 1
        const state = stageState(step.slug)
        const isRunning = state === "running" || state === "queued"
        const stageCompleted = state === "done"
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
                completed={stageCompleted}
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
