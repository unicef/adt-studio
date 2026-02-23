import type { StepState } from "./use-book-run"

/** A step counts as complete when it finished successfully or was skipped. */
export function isStepComplete(state: StepState | string): boolean {
  return state === "done" || state === "skipped"
}

/** A stage is complete when it has at least one step and all steps are complete. */
export function isStageComplete(stepStates: (StepState | string)[]): boolean {
  return stepStates.length > 0 && stepStates.every(isStepComplete)
}
