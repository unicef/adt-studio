import { useCallback, useEffect, useState } from "react"
import type { TaskInfoResponse } from "@/api/client"

/**
 * Tracks a section re-render from the moment it is submitted until its output
 * is on the page, so UI derived from the saved HTML (the missing-elements
 * notice, #596) doesn't flash in the gaps: a save refetches the page against
 * the old HTML before the task is even submitted, and a queued task isn't
 * "running" yet.
 *
 * Call `markSubmitted()` before the request, then `trackTask(taskId)` with the
 * response (no id: nothing to wait for) or `clear()` if it was rejected.
 * Clears itself when the tracked task fails, or once it completed and the page
 * shows the rendering version the task wrote.
 */
export function useAwaitingRerender(tasks: TaskInfoResponse[], renderingVersion: number | null) {
  // taskId null = request in flight.
  const [pending, setPending] = useState<{ taskId: string | null } | null>(null)

  const markSubmitted = useCallback(() => setPending({ taskId: null }), [])
  const clear = useCallback(() => setPending(null), [])
  const trackTask = useCallback(
    (taskId: string | undefined) => setPending((p) => (p && taskId ? { taskId } : null)),
    []
  )

  useEffect(() => {
    if (!pending?.taskId) return
    const task = tasks.find((t) => t.taskId === pending.taskId)
    if (!task) return
    if (task.status === "failed") {
      setPending(null)
      return
    }
    if (task.status !== "completed") return
    const written = (task.result as { version?: unknown } | undefined)?.version
    if (typeof written !== "number" || (renderingVersion ?? -1) >= written) setPending(null)
  }, [pending, tasks, renderingVersion])

  return { awaiting: pending != null, markSubmitted, trackTask, clear }
}
