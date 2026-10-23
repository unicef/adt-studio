import type { TaskInfoResponse } from "@/api/client"

export const GENERATE_ACTIVITY_KIND = "generate-activity"

export const STALE_TASK_MS = 30_000

export function createdSectionIndexOf(result: unknown): number | undefined {
  const toolCalls = (result as { toolCalls?: unknown } | null | undefined)?.toolCalls
  if (!Array.isArray(toolCalls)) return undefined
  for (const call of [...toolCalls].reverse()) {
    const { name, result: callResult } = (call ?? {}) as { name?: string; result?: unknown }
    if (name !== "createTemplatedActivity" && name !== "createCustomSection") continue
    const index = (callResult as { sectionIndex?: unknown } | null | undefined)?.sectionIndex
    if (typeof index === "number" && Number.isInteger(index) && index >= 0) return index
  }
  return undefined
}

function isPageTask(task: TaskInfoResponse, pageId: string | null): boolean {
  return task.kind === GENERATE_ACTIVITY_KIND && !!pageId && task.pageId === pageId
}

export function isGenerating(tasks: TaskInfoResponse[], pageId: string | null): boolean {
  return tasks.some((task) => isPageTask(task, pageId) && (task.status === "running" || task.status === "queued"))
}

export function finishedTasks(
  tasks: TaskInfoResponse[],
  pageId: string | null,
  status: "completed" | "failed",
  seen: Set<string>,
): TaskInfoResponse[] {
  return tasks.filter((task) => isPageTask(task, pageId) && task.status === status && !seen.has(task.taskId))
}

export function staleTaskIds(tasks: TaskInfoResponse[], now: number): string[] {
  return tasks
    .filter(
      (task) =>
        task.kind === GENERATE_ACTIVITY_KIND &&
        (task.status === "completed" || task.status === "failed") &&
        now - (task.completedAt ?? 0) > STALE_TASK_MS,
    )
    .map((task) => task.taskId)
}
