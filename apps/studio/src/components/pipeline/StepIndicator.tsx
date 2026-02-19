import { useState, useEffect } from "react"
import { Check, Loader2, Circle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { PIPELINE, ALL_STEP_NAMES } from "@adt/types"
import type { StepName, StepProgress } from "@/hooks/use-pipeline"

type StepState = "pending" | "active" | "completed" | "error"

interface StepIndicatorProps {
  step: StepName
  label: string
  state: StepState
  progress?: StepProgress
}

/** All step names in pipeline execution order */
const STEP_ORDER: StepName[] = PIPELINE.flatMap((stage) =>
  stage.steps.map((s) => s.name),
)

/** Step labels derived from the shared PIPELINE definition */
const STEP_LABELS: Record<StepName, string> = Object.fromEntries(
  PIPELINE.flatMap((stage) => stage.steps.map((s) => [s.name, s.label])),
) as Record<StepName, string>

export { STEP_ORDER, STEP_LABELS }

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "completed":
      return <Check className="h-4 w-4 text-green-600" />
    case "active":
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/30" />
  }
}

/** Ticking elapsed timer for active steps */
function ElapsedTimer() {
  const [start] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - start), 1000)
    return () => clearInterval(id)
  }, [start])

  const secs = Math.floor(elapsed / 1000)
  const mins = Math.floor(secs / 60)
  const display = mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`

  return <span className="text-xs text-muted-foreground">{display}</span>
}

export function StepIndicator({
  label,
  state,
  progress,
}: StepIndicatorProps) {
  const pct =
    state === "active" && progress?.totalPages
      ? Math.round(((progress.page ?? 0) / progress.totalPages) * 100)
      : state === "completed"
        ? 100
        : 0

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        state === "active" && "border-primary/20 bg-primary/5",
        state === "completed" && "border-green-200 bg-green-50/30",
        state === "error" && "border-destructive/30 bg-destructive/5",
        state === "pending" && "border-border/50 bg-muted/20 opacity-60"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={cn(
            "text-sm font-medium",
            state === "completed" && "text-green-700",
            state === "error" && "text-destructive",
            state === "pending" && "text-muted-foreground"
          )}
        >
          {label}
        </span>
        <StepIcon state={state} />
      </div>

      {/* Progress bar — always visible for active/completed */}
      <div className="h-1.5 rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            state === "active" && "bg-primary",
            state === "completed" && "bg-green-500",
            state === "error" && "bg-destructive",
            state === "pending" && "bg-transparent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status text */}
      <div className="mt-1.5 text-xs text-muted-foreground">
        {state === "active" && progress?.totalPages && (
          <div className="flex justify-between">
            <span>
              {progress.page ?? 0} / {progress.totalPages} pages
            </span>
            <span>{pct}%</span>
          </div>
        )}
        {state === "active" && !progress?.totalPages && (
          <span>Processing...</span>
        )}
        {state === "completed" && <span>Done</span>}
        {state === "error" && <span>Failed</span>}
        {state === "pending" && <span>Waiting</span>}
      </div>
      {state === "active" && progress?.totalPages && progress.page != null && progress.page < progress.totalPages && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Remaining pages may need multiple LLM attempts...
        </p>
      )}
    </div>
  )
}
