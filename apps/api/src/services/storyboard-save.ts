import type { Storage } from "@adt/storage"
import {
  IMAGE_SET_CHANGE_CLEAR_NODE_TYPES,
  IMAGE_SET_CHANGE_CLEAR_STEPS,
  PIPELINE,
  getStageClearOrder,
  getStageDependents,
} from "@adt/types"
import { assertNoActivePipelineRun } from "./pipeline-run-guard.js"

export function clearCaptionData(storage: Storage): void {
  storage.clearNodesByType([...IMAGE_SET_CHANGE_CLEAR_NODE_TYPES])
  storage.clearStepRuns([...IMAGE_SET_CHANGE_CLEAR_STEPS])
}

export function markStoryboardChainStale(
  storage: Storage,
  { includeStoryboard = true }: { includeStoryboard?: boolean } = {}
): void {
  const stages = new Set<string>(
    includeStoryboard ? getStageClearOrder("storyboard") : getStageDependents("storyboard")
  )
  storage.clearStepRuns(
    PIPELINE.filter((stage) => stages.has(stage.name)).flatMap((stage) =>
      stage.steps.map((step) => step.name)
    )
  )
}

/**
 * Save storyboard (web-rendering) node data and clear stale downstream data.
 * Use for all user-initiated storyboard saves (NOT pipeline stage runs).
 */
export function saveStoryboardNode(
  storage: Storage,
  node: "page-sectioning" | "web-rendering",
  itemId: string,
  data: unknown,
  { renderingInSync = false }: { renderingInSync?: boolean } = {}
): number {
  if (node === "page-sectioning") assertNoActivePipelineRun(storage)
  const version = storage.putNodeData(node, itemId, data)
  clearCaptionData(storage)
  // A sectioning change invalidates the storyboard's rendered HTML — and the
  // structural ops go further: a split drops both halves' HTML and a cross-page
  // merge empties both pages, so those sections would silently vanish from the
  // packaged book while the stage still read "done". A `web-rendering` save is
  // itself the storyboard's output, so it must NOT mark storyboard stale.
  //
  // `renderingInSync` is the Storyboard editor saving a per-section edit whose
  // HTML it has already mirrored, or has queued a targeted re-render for. The
  // storyboard is current (or seconds from it) and only its dependents are
  // behind, so resetting the stage would take the editor away for nothing.
  if (node === "page-sectioning") {
    markStoryboardChainStale(storage, { includeStoryboard: !renderingInSync })
  }
  return version
}
