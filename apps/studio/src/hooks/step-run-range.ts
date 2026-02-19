import { UI_STEP_ORDER, type UIStepSlug } from "./step-mapping"

// Re-export so existing imports still work
export { isFinalPipelineStepForUiStep } from "./step-mapping"

export function getTargetStepsForRange(fromStep: string, toStep: string): Set<string> {
  const fromIndex = UI_STEP_ORDER.indexOf(fromStep as UIStepSlug)
  const toIndex = UI_STEP_ORDER.indexOf(toStep as UIStepSlug)
  if (fromIndex !== -1 && toIndex !== -1 && fromIndex <= toIndex) {
    return new Set(UI_STEP_ORDER.slice(fromIndex, toIndex + 1))
  }

  // Fallback for unknown/reversed ranges to avoid dropping status entirely.
  const targetSteps = new Set<string>()
  targetSteps.add(fromStep)
  if (fromStep !== toStep) targetSteps.add(toStep)
  return targetSteps
}
