import { PIPELINE, STAGE_BY_NAME } from "@adt/types"
import type { StepName, StageName } from "@adt/types"
import type { Progress } from "./progress.js"

// ── Generic DAG runner ──────────────────────────────────────────

export type NodeStatus = "pending" | "running" | "complete" | "failed" | "skipped"

export interface DAGNode<T extends string> {
  id: T
  dependsOn: T[]
}

export interface DAGResult<T extends string> {
  statuses: Map<T, NodeStatus>
  errors: Map<T, Error>
}

/**
 * Execute a DAG of nodes with maximum parallelism.
 *
 * Nodes whose dependencies are all "complete" start immediately.
 * If a node fails, all transitive dependents are marked "skipped".
 * Returns the final status and collected errors for every node.
 */
export async function runDAG<T extends string>(
  nodes: DAGNode<T>[],
  execute: (id: T) => Promise<void>,
  onSkip?: (id: T) => void,
): Promise<DAGResult<T>> {
  const statuses = new Map<T, NodeStatus>(nodes.map((n) => [n.id, "pending"]))
  const errors = new Map<T, Error>()
  const running = new Map<T, Promise<void>>()

  const isFailed = (id: T) => {
    const s = statuses.get(id)
    return s === "failed" || s === "skipped"
  }

  function tick() {
    for (const node of nodes) {
      const s = statuses.get(node.id)!
      if (s !== "pending") continue

      if (node.dependsOn.some(isFailed)) {
        statuses.set(node.id, "skipped")
        onSkip?.(node.id)
        continue
      }

      if (!node.dependsOn.every((dep) => statuses.get(dep) === "complete")) continue

      statuses.set(node.id, "running")
      const p = execute(node.id)
        .then(() => {
          statuses.set(node.id, "complete")
        })
        .catch((err) => {
          statuses.set(node.id, "failed")
          errors.set(node.id, err instanceof Error ? err : new Error(String(err)))
        })
        .finally(() => {
          running.delete(node.id)
        })
      running.set(node.id, p)
    }
  }

  tick()
  while (running.size > 0) {
    await Promise.race(running.values())
    tick()
  }

  return { statuses, errors }
}

// ── Pipeline-specific runner ────────────────────────────────────

export type StepExecutor = (progress: Progress) => Promise<void>

export interface PipelineDAGResult {
  stages: DAGResult<StageName>
  steps: DAGResult<StepName>
}

/**
 * Run the full pipeline as a two-level DAG (stages → steps).
 *
 * Stage dependencies control inter-stage ordering. Step dependencies
 * within each stage control intra-stage parallelism.
 *
 * Lifecycle events (step-start, step-complete, step-error, step-skip)
 * are emitted automatically. Executors should only emit step-progress
 * and llm-log events.
 *
 * Steps without an executor are treated as no-ops (immediately complete).
 */
export async function runPipelineDAG(
  executors: Map<StepName, StepExecutor>,
  progress: Progress,
): Promise<PipelineDAGResult> {
  const allStepStatuses = new Map<StepName, NodeStatus>()
  const allStepErrors = new Map<StepName, Error>()

  const stageNodes: DAGNode<StageName>[] = PIPELINE.map((s) => ({
    id: s.name,
    dependsOn: [...s.dependsOn],
  }))

  const stageResult = await runDAG(
    stageNodes,
    async (stageName) => {
      const stage = STAGE_BY_NAME[stageName]
      const stepNodes: DAGNode<StepName>[] = stage.steps.map((s) => ({
        id: s.name,
        dependsOn: [...(s.dependsOn ?? [])],
      }))

      const stepResult = await runDAG(
        stepNodes,
        async (stepName) => {
          progress.emit({ type: "step-start", step: stepName })
          try {
            const executor = executors.get(stepName)
            if (executor) {
              await executor(progress)
            }
            progress.emit({ type: "step-complete", step: stepName })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            progress.emit({ type: "step-error", step: stepName, error: message })
            throw err
          }
        },
        (stepName) => {
          progress.emit({ type: "step-skip", step: stepName })
        },
      )

      // Merge step results into the combined map
      for (const [id, status] of stepResult.statuses) {
        allStepStatuses.set(id, status)
      }
      for (const [id, err] of stepResult.errors) {
        allStepErrors.set(id, err)
      }

      // If any step in the stage failed, fail the stage
      if (stepResult.errors.size > 0) {
        const msgs = [...stepResult.errors.entries()]
          .map(([step, err]) => `${step}: ${err.message}`)
        throw new Error(msgs.join("\n"))
      }
    },
    (stageName) => {
      // When a stage is skipped, skip all its steps too
      const stage = STAGE_BY_NAME[stageName]
      for (const step of stage.steps) {
        allStepStatuses.set(step.name, "skipped")
        progress.emit({ type: "step-skip", step: step.name })
      }
    },
  )

  return {
    stages: stageResult,
    steps: { statuses: allStepStatuses, errors: allStepErrors },
  }
}
