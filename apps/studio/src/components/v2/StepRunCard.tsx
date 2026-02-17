import { Check, Loader2, Play, RotateCcw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { STEPS } from "./StepSidebar"
import { useStepRun } from "@/hooks/use-step-run"

export interface StepRunCardSubStep {
  key: string
  label: string
}

interface StepRunCardProps {
  stepSlug: string
  subSteps: StepRunCardSubStep[]
  description?: string
  isRunning: boolean
  completed?: boolean
  onRun: () => void
  disabled: boolean
}

export function StepRunCard({ stepSlug, subSteps, description, isRunning, completed, onRun, disabled }: StepRunCardProps) {
  const stepConfig = STEPS.find((s) => s.slug === stepSlug)
  const { progress } = useStepRun()
  const { subSteps: subStepProgress, error, targetSteps } = progress

  const Icon = stepConfig?.icon ?? Play
  const bgDark = stepConfig?.bgDark ?? "bg-gray-700"
  const color = stepConfig?.color ?? "bg-gray-500"
  const borderColor = stepConfig?.borderColor ?? "border-gray-200"
  const hasError = !!error && targetSteps.has(stepSlug)

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden max-w-xl", borderColor)}>
      {/* Colored header */}
      <div className={cn("px-4 py-2 flex items-center gap-2.5 text-white", bgDark)}>
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
          <Icon className="w-3 h-3" />
        </div>
        <span className="text-sm font-semibold">
          {isRunning
            ? `${stepConfig?.runningLabel ?? stepSlug}...`
            : stepConfig?.label ?? stepSlug}
        </span>
      </div>

      {/* Main row: sub-steps | button | description */}
      <div className="flex items-center gap-5 px-5 py-3">
        {/* Sub-steps */}
        <div className="space-y-1.5 w-48 shrink-0">
          {subSteps.map(({ key, label }) => {
            const sub = subStepProgress.get(key)
            const isDone = sub?.state === "done" || (completed && !sub)
            const isSubRunning = sub?.state === "running"
            const isError = sub?.state === "error"
            const hasPages = sub?.page != null && sub?.totalPages != null && sub.totalPages > 0

            return (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-2.5 text-xs whitespace-nowrap",
                  isDone ? "text-muted-foreground" : isError ? "text-red-500" : isSubRunning ? "text-foreground" : "text-muted-foreground/50",
                )}
              >
                {isDone ? (
                  <Check className="w-4 h-4 text-green-500 shrink-0" />
                ) : isError ? (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                ) : isSubRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-current opacity-30 shrink-0" />
                )}
                <span>{label}</span>
                {isSubRunning && hasPages && (
                  <span className="text-muted-foreground tabular-nums">{sub.page}/{sub.totalPages}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Play / Retry / Spinner button */}
        <div className="shrink-0">
          {isRunning ? (
            <div className={cn(
              "flex items-center justify-center w-12 h-12 rounded-full opacity-60",
              color, "text-white",
            )}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                "flex items-center justify-center w-12 h-12 rounded-full transition-all cursor-pointer",
                "hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-default disabled:hover:scale-100",
                color, "text-white",
              )}
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRun() }}
              title={hasError ? "Retry" : `Run ${stepConfig?.label?.toLowerCase() ?? stepSlug}`}
            >
              {hasError ? <RotateCcw className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
          )}
        </div>

        {/* Description */}
        {description && (
          <p className="flex-1 min-w-0 text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Error footer */}
      {hasError && (
        <div className="px-5 pb-5 -mt-1">
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-700 whitespace-pre-wrap break-words">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
