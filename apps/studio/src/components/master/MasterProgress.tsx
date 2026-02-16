import { CheckCircle2, XCircle, Play } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StepIndicator, STEP_LABELS } from "@/components/pipeline/StepIndicator"
import type { PipelineProgress } from "@/hooks/use-pipeline"
import type { StepName } from "@/hooks/use-pipeline"

interface MasterProgressProps {
  progress: PipelineProgress
  onRun: () => void
  isStarting: boolean
  hasApiKey: boolean
}

function getStepState(
  step: StepName,
  progress: PipelineProgress
): "pending" | "active" | "completed" | "error" {
  if (progress.completedSteps.has(step)) return "completed"
  if (progress.stepProgress.has(step)) return "active"
  if (progress.currentStep === step) return "active"
  if (progress.error?.startsWith(step)) return "error"
  return "pending"
}

const MASTER_STEPS: StepName[] = ["text-catalog", "catalog-translation", "tts"]

export function MasterProgress({
  progress,
  onRun,
  isStarting,
  hasApiKey,
}: MasterProgressProps) {
  const { isRunning, isComplete, error } = progress

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
              Master Phase
            </CardTitle>
            <CardDescription className="mt-1">
              {!isRunning && !isComplete && !error &&
                "Build text catalog, translate, and generate speech for output languages."}
              {isRunning && "Master phase is running..."}
              {isComplete && "Master phase completed."}
              {error && !isRunning && `Master failed: ${error}`}
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
                    : "Run Master"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {(isRunning || isComplete || error) && (
          <div className="mb-4 space-y-2">
            {MASTER_STEPS.map((step) => (
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
            Enter your OpenAI API key to run the master phase.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
