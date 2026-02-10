import { Check, Loader2, Circle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StepName, StepProgress } from "@/hooks/use-pipeline"

type StepState = "pending" | "active" | "completed" | "error"

interface StepIndicatorProps {
  step: StepName
  label: string
  state: StepState
  progress?: StepProgress
}

const STEP_ORDER: StepName[] = [
  "extract",
  "metadata",
  "text-classification",
  "image-classification",
  "page-sectioning",
  "web-rendering",
]

const STEP_LABELS: Record<StepName, string> = {
  extract: "Extract PDF",
  metadata: "Extract Metadata",
  "text-classification": "Classify Text",
  "image-classification": "Classify Images",
  "page-sectioning": "Section Pages",
  "web-rendering": "Render Pages",
}

export { STEP_ORDER, STEP_LABELS }

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "completed":
      return <Check className="h-4 w-4 text-green-600" />
    case "active":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/30" />
  }
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
        state === "active" && "border-blue-200 bg-blue-50/50",
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
            state === "active" && "bg-blue-600",
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
          <span>
            {progress.page ?? 0} / {progress.totalPages} pages
          </span>
        )}
        {state === "active" && !progress?.totalPages && (
          <span>Processing...</span>
        )}
        {state === "completed" && <span>Done</span>}
        {state === "error" && <span>Failed</span>}
        {state === "pending" && <span>Waiting</span>}
      </div>
    </div>
  )
}
