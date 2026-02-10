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
  return "pending"
}

export function PipelineProgress({
  progress,
  onRun,
  isStarting,
  hasApiKey,
}: PipelineProgressProps) {
  const { isRunning, isComplete, error } = progress

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isComplete && (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          )}
          {error && !isRunning && (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          Pipeline
        </CardTitle>
        <CardDescription>
          {!isRunning && !isComplete && !error &&
            "Run the pipeline to extract and process this book."}
          {isRunning && "Pipeline is running..."}
          {isComplete && "Pipeline completed successfully."}
          {error && !isRunning && `Pipeline failed: ${error}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {(isRunning || isComplete || error) && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STEP_ORDER.map((step) => (
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

        {!isRunning && (
          <Button
            onClick={onRun}
            disabled={isStarting || !hasApiKey}
          >
            <Play className="mr-2 h-4 w-4" />
            {isStarting
              ? "Starting..."
              : isComplete
                ? "Re-run Pipeline"
                : error
                  ? "Retry Pipeline"
                  : "Run Pipeline"}
          </Button>
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
