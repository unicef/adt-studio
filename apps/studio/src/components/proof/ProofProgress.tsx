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

interface ProofProgressProps {
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

const PROOF_STEP: StepName = "image-captioning"

export function ProofProgress({
  progress,
  onRun,
  isStarting,
  hasApiKey,
}: ProofProgressProps) {
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
              Proof Phase
            </CardTitle>
            <CardDescription className="mt-1">
              {!isRunning && !isComplete && !error &&
                "Generate image captions using LLM analysis."}
              {isRunning && "Proof phase is running..."}
              {isComplete && "Proof phase completed. Check captions in page detail."}
              {error && !isRunning && `Proof failed: ${error}`}
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
                    : "Run Proof"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {(isRunning || isComplete || error) && (
          <div className="mb-4">
            <StepIndicator
              step={PROOF_STEP}
              label={STEP_LABELS[PROOF_STEP]}
              state={getStepState(PROOF_STEP, progress)}
              progress={progress.stepProgress.get(PROOF_STEP)}
            />
          </div>
        )}

        {!hasApiKey && !isRunning && (
          <p className="mt-2 text-xs text-muted-foreground">
            Enter your OpenAI API key to run the proof phase.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
