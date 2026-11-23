import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, type TaskInfoResponse } from "@/api/client"

import { sectioningErrorMessage } from "@/lib/sectioning-error"

const EMPTY_TASKS: TaskInfoResponse[] = []

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const bookTasksKey = (label: string) => ["books", label, "tasks"] as const

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookTasks(label: string) {
  const { data } = useQuery({
    queryKey: bookTasksKey(label),
    queryFn: () => api.getTasks(label),
    enabled: !!label,
    // Poll every 5s as fallback — primary updates come via SSE
    refetchInterval: 5_000,
  })

  const tasks = useMemo(() => data?.tasks.map((task) => ({ ...task, error: sectioningErrorMessage(task.error), progressMessage: sectioningErrorMessage(task.progressMessage) })) ?? EMPTY_TASKS, [data?.tasks])

  const runningTasks = useMemo(
    () => tasks.filter((t) => t.status === "running" || t.status === "queued"),
    [tasks],
  )

  const isTaskRunning = useCallback(
    (kind?: string, pageId?: string): boolean => {
      return tasks.some(
        (t) =>
          (t.status === "running" || t.status === "queued") &&
          (!kind || t.kind === kind) &&
          (!pageId || t.pageId === pageId)
      )
    },
    [tasks]
  )

  const getTask = useCallback(
    (taskId: string): TaskInfoResponse | undefined => {
      return tasks.find((t) => t.taskId === taskId)
    },
    [tasks]
  )

  return {
    tasks,
    runningTasks,
    runningCount: runningTasks.length,
    isTaskRunning,
    getTask,
  }
}
