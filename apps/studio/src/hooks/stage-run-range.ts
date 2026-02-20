import { STAGE_ORDER } from "@adt/types"
import type { StageName } from "@adt/types"


export function getTargetStagesForRange(fromStage: string, toStage: string): Set<string> {
  const fromIndex = STAGE_ORDER.indexOf(fromStage as StageName)
  const toIndex = STAGE_ORDER.indexOf(toStage as StageName)
  if (fromIndex !== -1 && toIndex !== -1 && fromIndex <= toIndex) {
    return new Set(STAGE_ORDER.slice(fromIndex, toIndex + 1))
  }

  // Fallback for unknown/reversed ranges to avoid dropping status entirely.
  const targetSteps = new Set<string>()
  targetSteps.add(fromStage)
  if (fromStage !== toStage) targetSteps.add(toStage)
  return targetSteps
}
