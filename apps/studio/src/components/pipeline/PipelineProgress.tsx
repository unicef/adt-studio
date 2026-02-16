import { CheckCircle2, XCircle, Play } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  StepIndicator,
  STEP_ORDER,
  STEP_LABELS,
} from "./StepIndicator"
import type { PipelineProgress as PipelineProgressState } from "@/hooks/use-pipeline"
import type { StepName } from "@/hooks/use-pipeline"

interface PipelineProgressProps {
  progress: PipelineProgressState
  onRun: () => void
  isStarting: boolean
  hasApiKey: boolean
}

function getStepState(
  step: StepName,
  progress: PipelineProgressState
): "pending" | "active" | "completed" | "error" {
  if (progress.completedSteps.has(step)) return "completed"
  if (progress.stepProgress.has(step)) return "active"
  if (progress.currentStep === step) return "active"
  if (progress.error?.startsWith(step)) return "error"

  // Per-page steps (classify, section, render) run concurrently across pages.
  // A step is effectively completed when all pages have finished it,
  // even before the final step-complete event arrives.
  const stepProg = progress.stepProgress.get(step)
  if (stepProg) {
    if (stepProg.totalPages && stepProg.page != null && stepProg.page >= stepProg.totalPages) {
      return "completed"
    }
    return "active"
  }

  if (progress.currentStep === step) return "active"
  return "pending"
}

export function PipelineProgress({
  progress,
  onRun,
  isStarting,
  hasApiKey,
}: PipelineProgressProps) {
  const { isRunning, isComplete, error, skippedSteps } = progress
  const visibleSteps = STEP_ORDER.filter((s) => !skippedSteps.has(s))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {isComplete && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              {error && !isRunning && (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              Pipeline
            </CardTitle>
            <CardDescription className="mt-1">
              {!isRunning && !isComplete && !error &&
                "Run the pipeline to extract and process this book."}
              {isRunning && "Pipeline is running..."}
              {isComplete && "Pipeline completed successfully."}
              {error && !isRunning && `Pipeline failed: ${error}`}
            </CardDescription>
          </div>
          {!isRunning && (
            <Button
              onClick={onRun}
              disabled={isStarting || !hasApiKey}
              size="sm"
            >
              <Play className="mr-2 h-4 w-4" />
              {isStarting
                ? "Starting..."
                : isComplete
                  ? "Re-run"
                  : error
                    ? "Retry"
                    : "Run Pipeline"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {(isRunning || isComplete || error) && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleSteps.map((step) => (
              <StepIndicator
                key={step}
                step={step}
                label={STEP_LABELS[step]}
                state={getStepState(step, progress)}
                progress={progress.stepProgress.get(step)}
              />
            ))}
          </div>
        )}

        {!hasApiKey && !isRunning && (
          <p className="mt-2 text-xs text-muted-foreground">
            Enter your OpenAI API key to run the pipeline.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
