import { Workflow, type LucideIcon } from "lucide-react"
import { PIPELINE, STAGE_BY_NAME, type StageDef, type StageName, type StepName } from "@adt/types"
import { STAGES } from "@/components/pipeline/stage-config"
import {
  getStageLabelI18n,
  getStageRunningLabelI18n,
  getStepLabelI18n,
} from "@/components/pipeline/pipeline-i18n"
import { isStepComplete } from "@/hooks/run-state"
import {
  useBookRun,
  type BookRunContextValue,
  type StageState,
  type StepProgress,
  type StepState,
} from "@/hooks/use-book-run"

export interface RunStepActivity {
  name: StepName
  label: string
  state: StepState
  progress?: string
  error?: string
}

export interface RunStageActivity {
  slug: StageName
  label: string
  runningLabel: string
  hex: string
  icon: LucideIcon
  state: StageState
  isActive: boolean
  steps: RunStepActivity[]
  runningCount: number
  doneCount: number
  current?: RunStepActivity
}

export interface RunActivity {
  activeStages: RunStageActivity[]
  badgeCount: number
  isRunning: boolean
  isCancelling: boolean
  error: string | null
  cancelRun: () => void
}

const NEUTRAL_HEX = "#64748b"

function stageVisual(slug: StageName): { hex: string; icon: LucideIcon } {
  const stage = STAGES.find((s) => s.slug === slug)
  return { hex: stage?.hex ?? NEUTRAL_HEX, icon: stage?.icon ?? Workflow }
}

function toProgressLabel(progress: StepProgress | undefined): string | undefined {
  if (!progress) return undefined
  const pageLabel =
    progress.page != null && progress.totalPages != null && progress.totalPages > 0
      ? `${progress.page}/${progress.totalPages}`
      : undefined
  return progress.message?.trim() || pageLabel
}

function spinFirstPendingStep(steps: RunStepActivity[], isActive: boolean): RunStepActivity[] {
  if (!isActive || steps.some((step) => step.state === "running")) return steps
  const firstPending = steps.find((step) => !isStepComplete(step.state) && step.state !== "error")
  if (!firstPending) return steps
  return steps.map((step) =>
    step === firstPending ? { ...step, state: "running" as StepState } : step,
  )
}

function buildStageActivity(def: StageDef, run: BookRunContextValue): RunStageActivity {
  const state = run.stageState(def.name)
  const isActive = state === "running" || state === "queued"

  const steps = spinFirstPendingStep(
    def.steps.map((step) => ({
      name: step.name,
      label: getStepLabelI18n(step.name),
      state: run.stepState(step.name),
      progress: toProgressLabel(run.stepProgress(step.name)),
      error: run.stepError(step.name),
    })),
    isActive,
  )

  const running = steps.filter((step) => step.state === "running")

  return {
    slug: def.name,
    label: getStageLabelI18n(def.name),
    runningLabel: getStageRunningLabelI18n(def.name),
    ...stageVisual(def.name),
    state,
    isActive,
    steps,
    runningCount: running.length,
    doneCount: steps.filter((step) => isStepComplete(step.state)).length,
    current: running.find((step) => step.progress) ?? running[0],
  }
}

export function useStageActivity(stage: StageName): RunStageActivity {
  const run = useBookRun()
  return buildStageActivity(STAGE_BY_NAME[stage], run)
}

/** Like `useStageActivity`, but null for slugs outside the pipeline (sign language). */
export function useOptionalStageActivity(stage: string): RunStageActivity | null {
  const run = useBookRun()
  const def = STAGE_BY_NAME[stage as StageName]
  return def ? buildStageActivity(def, run) : null
}

export function useRunActivity(): RunActivity {
  const run = useBookRun()
  const activeStages = PIPELINE.map((def) => buildStageActivity(def, run)).filter((s) => s.isActive)
  const runningSteps = activeStages.reduce((total, stage) => total + stage.runningCount, 0)

  return {
    activeStages,
    badgeCount: runningSteps || activeStages.length,
    isRunning: run.isRunning,
    isCancelling: run.isCancelling,
    error: run.error,
    cancelRun: run.cancelRun,
  }
}
