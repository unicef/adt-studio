import {
  PIPELINE,
  STEP_TO_STAGE,
  STAGE_ORDER,
  ALL_STEP_NAMES,
} from "@adt/types"
import type { StepName, StageName } from "@adt/types"

/**
 * UI step mapping derived from the shared PIPELINE definition.
 *
 * UIStepSlug = StageName — the pipeline definition is the single source of truth.
 */
export type UIStepSlug = StageName

export const UI_STEP_ORDER = STAGE_ORDER

/** Maps every pipeline step name to its parent stage. */
export const PIPELINE_TO_UI_STEP: Record<StepName, StageName> = STEP_TO_STAGE

/** The last pipeline step in each stage — used to detect completion. */
export const UI_FINAL_PIPELINE_STEP: Record<StageName, StepName> =
  Object.fromEntries(
    PIPELINE.map((stage) => [
      stage.name,
      stage.steps[stage.steps.length - 1].name,
    ]),
  ) as Record<StageName, StepName>

/** All pipeline step names that appear in the pipeline definition. */
export const ALL_MAPPED_STEP_NAMES = ALL_STEP_NAMES

export function isFinalPipelineStepForUiStep(
  uiStep: string,
  pipelineStep: string,
): boolean {
  return UI_FINAL_PIPELINE_STEP[uiStep as StageName] === pipelineStep
}
