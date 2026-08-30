import { HTTPException } from "hono/http-exception"
import type { Storage } from "@adt/storage"

export function getRunningSteps(storage: Storage): string[] {
  return storage
    .getStepRuns()
    .filter((run) => run.status === "running")
    .map((run) => run.step)
}

export function activePipelineRunMessage(runningSteps: string[]): string {
  return `Cannot change sectioning while pipeline steps are running: ${runningSteps.join(", ")}. Wait for the run to finish or cancel it first.`
}

/**
 * A running pipeline step can commit node data and mark itself complete after a
 * manual Sectioning mutation. Refuse the mutation instead of letting that stale
 * completion resurrect the downstream chain as "done".
 *
 * Lives at the service level so route handlers and chat tools share one guard.
 */
export function assertNoActivePipelineRun(storage: Storage): void {
  const runningSteps = getRunningSteps(storage)
  if (runningSteps.length === 0) return

  throw new HTTPException(409, { message: activePipelineRunMessage(runningSteps) })
}
