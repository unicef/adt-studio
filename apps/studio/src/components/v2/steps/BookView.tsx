import { Link } from "@tanstack/react-router"
import { STEPS, STEP_DESCRIPTIONS } from "../StepSidebar"
import { useStepRun } from "@/hooks/use-step-run"
import { StepProgressRing } from "../StepProgressRing"

interface ViewProps {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}


export function BookView({ bookLabel }: ViewProps) {
  const pipelineSteps = STEPS.filter((s) => s.slug !== "book")
  const { progress: stepRunProgress } = useStepRun()

  return (
    <div className="flex flex-col items-start max-w-xl">
      {pipelineSteps.map((step, index) => {
        const Icon = step.icon
        const isLast = index === pipelineSteps.length - 1

        const stepProgress = stepRunProgress.steps.get(step.slug)
        const ringState = stepProgress?.state ?? "idle"

        return (
          <div key={step.slug} className="w-full">
            <Link
              to="/books/$label/v2/$step"
              params={{ label: bookLabel, step: step.slug }}
              className={`rounded-lg border ${step.borderColor} ${step.bgLight} p-3 flex gap-3 items-center h-[76px] overflow-hidden hover:shadow-sm transition-shadow w-full`}
            >
              <div className="relative shrink-0">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step.color} text-white`}>
                  <Icon className="w-4 h-4" />
                </div>
                <StepProgressRing
                  size={32}
                  state={ringState}
                  colorClass={step.color}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={`text-sm font-semibold ${step.textColor}`}>{step.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                  {ringState === "running" && stepProgress?.totalPages
                    ? `Processing ${stepProgress.page ?? 0} / ${stepProgress.totalPages} pages...`
                    : ringState === "queued"
                      ? "Queued..."
                      : STEP_DESCRIPTIONS[step.slug]}
                </p>
              </div>
            </Link>
            {!isLast && (
              <div className="flex flex-col items-center w-8 ml-3 mb-1">
                <div className={`w-1.5 h-2 ${step.color} opacity-25`} />
                <svg viewBox="0 0 12 8" className="w-3 h-2 opacity-40" fill="currentColor">
                  <path d="M6 8L0 0h12z" className={step.textColor} />
                </svg>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
