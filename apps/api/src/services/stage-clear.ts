import { createBookStorage } from "@adt/storage"
import {
  PIPELINE,
  getStageClearOrder,
  getStageRerunClearNodes,
  type PipelineNodeName,
  type StageName,
} from "@adt/types"

export interface StageClearPlan {
  /** Node types whose stored output this run will delete. */
  nodes: PipelineNodeName[]
  /** Stages whose completion state this run will reset. */
  stages: StageName[]
  /** True when the run restarts from extraction and drops every extracted page. */
  clearsExtractedData: boolean
}

/**
 * What starting a run at `fromStage` will destroy. Computed without touching
 * the book so it can be shown for approval before anything runs.
 */
export function planStageClear(fromStage: StageName, toStage: StageName): StageClearPlan {
  if (fromStage === "extract") {
    return { nodes: [], stages: getStageClearOrder(fromStage), clearsExtractedData: true }
  }
  return {
    nodes: getStageRerunClearNodes(fromStage, toStage),
    stages: getStageClearOrder(fromStage),
    clearsExtractedData: false,
  }
}

/**
 * Build a beforeRun callback that clears downstream data for a stage.
 * The returned function is idempotent — only runs once even if called multiple times.
 */
export function makeBeforeRun(
  label: string,
  fromStage: StageName,
  toStage: StageName,
  booksDir: string,
): () => void {
  let ran = false
  return () => {
    if (ran) return
    ran = true
    const storage = createBookStorage(label, booksDir)
    try {
      if (fromStage === "extract") {
        // clearExtractedData also clears step_runs
        storage.clearExtractedData()
      } else {
        const nodes = getStageRerunClearNodes(fromStage, toStage)
        if (nodes.length > 0) {
          storage.clearNodesByType(nodes)
        }
        if (fromStage === "storyboard" && typeof storage.clearDebugImages === "function") {
          storage.clearDebugImages()
        }
        // Clear step run records for all downstream stages
        const stagesToClear = getStageClearOrder(fromStage)
        const stepsToClear = PIPELINE
          .filter((s) => stagesToClear.includes(s.name))
          .flatMap((s) => s.steps.map((step) => step.name))
        storage.clearStepRuns(stepsToClear)
      }
    } finally {
      storage.close()
    }
  }
}
