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

const PROOF_STEPS: StepName[] = ["image-captioning", "glossary", "quiz-generation"]

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
                "Generate image captions, glossary, and comprehension quizzes."}
              {isRunning && "Proof phase is running..."}
              {isComplete && "Proof phase completed."}
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
          <div className="mb-4 space-y-2">
            {PROOF_STEPS.map((step) => (
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
            Enter your OpenAI API key to run the proof phase.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
