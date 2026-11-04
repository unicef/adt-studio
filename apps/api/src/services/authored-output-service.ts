import { HTTPException } from "hono/http-exception"
import type { Storage } from "@adt/storage"
export { protectedAuthoredRecords, assertAuthoredReplacement, replacementConfirmed } from "@adt/pipeline"

/** Also reject persisted running steps after restart, before any draft write. */
export function assertAuthoredIdle(storage: Storage): void {
  const running = storage.getStepRuns().filter((run) => run.status === "running")
  if (running.length) throw new HTTPException(409, { message: "A pipeline step is running. Keep your draft and retry after it stops." })
}
