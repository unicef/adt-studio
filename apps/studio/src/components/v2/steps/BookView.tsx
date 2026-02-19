import { useCallback } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { STEPS, STEP_DESCRIPTIONS, isStepCompleted } from "../StepSidebar"
import { useStepRun } from "@/hooks/use-step-run"
import { useApiKey } from "@/hooks/use-api-key"
import { api } from "@/api/client"
import { StepRunCard, type StepRunCardSubStep } from "../StepRunCard"

const STEP_SUB_STEPS: Record<string, StepRunCardSubStep[]> = {
  extract: [
    { key: "extract", label: "Extract PDF" },
    { key: "metadata", label: "Extract Metadata" },
    { key: "image-classification", label: "Classify Images" },
    { key: "image-cropping", label: "Crop Images" },
    { key: "text-classification", label: "Classify Text" },
    { key: "translation", label: "Translate" },
    { key: "book-summary", label: "Book Summary" },
  ],
  storyboard: [
    { key: "page-sectioning", label: "Section Pages" },
    { key: "web-rendering", label: "Render Pages" },
  ],
  quizzes: [
    { key: "quiz-generation", label: "Generate Quizzes" },
  ],
  captions: [
    { key: "image-captioning", label: "Caption Images" },
  ],
  glossary: [
    { key: "glossary", label: "Generate Glossary" },
  ],
  translations: [
    { key: "text-catalog", label: "Build Text Catalog" },
    { key: "catalog-translation", label: "Translate Entries" },
    { key: "tts", label: "Generate Audio" },
  ],
}

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
    // Translations step runs both translations + TTS
    const toStep = slug === "translations" ? "text-to-speech" : slug
    try {
      startRun(slug, toStep)
      setSseEnabled(true)
      await api.runSteps(bookLabel, apiKey, { fromStep: slug, toStep }, { key: azureKey, region: azureRegion })
      queryClient.removeQueries({ queryKey: ["books", bookLabel, "pages"] })
      queryClient.removeQueries({ queryKey: ["books", bookLabel] })
      if (slug === "translations") {
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
        // For translations, also check TTS running state
        const ttsProgress = step.slug === "translations" ? stepRunProgress.steps.get("text-to-speech") : undefined
        const ttsRingState = ttsProgress?.state ?? "idle"
        const isRunning = ringState === "running" || ringState === "queued"
          || ttsRingState === "running" || ttsRingState === "queued"
        const subSteps = STEP_SUB_STEPS[step.slug]

        return (
          <div key={step.slug} className="w-full">
            <Link
              to="/books/$label/v2/$step"
              params={{ label: bookLabel, step: step.slug }}
              className="block"
            >
              <StepRunCard
                stepSlug={step.slug}
                subSteps={subSteps ?? []}
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
