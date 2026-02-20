import { STAGE_ORDER } from "@adt/types"
import type { StageName } from "@adt/types"


export function getTargetStepsForRange(fromStep: string, toStep: string): Set<string> {
  const fromIndex = STAGE_ORDER.indexOf(fromStep as StageName)
  const toIndex = STAGE_ORDER.indexOf(toStep as StageName)
  if (fromIndex !== -1 && toIndex !== -1 && fromIndex <= toIndex) {
    return new Set(STAGE_ORDER.slice(fromIndex, toIndex + 1))
  }

  // Fallback for unknown/reversed ranges to avoid dropping status entirely.
  const targetSteps = new Set<string>()
  targetSteps.add(fromStep)
  if (fromStep !== toStep) targetSteps.add(toStep)
  return targetSteps
}
