import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, type TaskInfoResponse } from "@/api/client"

const EMPTY_TASKS: TaskInfoResponse[] = []

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const bookTasksKey = (label: string) => ["books", label, "tasks"] as const

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookTasks(label: string) {
  const { data, dataUpdatedAt, isFetching } = useQuery({
    queryKey: bookTasksKey(label),
    queryFn: () => api.getTasks(label),
    enabled: !!label,
    // Poll every 5s as fallback — primary updates come via SSE
    refetchInterval: 5_000,
  })

  const tasks = data?.tasks ?? EMPTY_TASKS

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
    dataUpdatedAt,
    isFetching,
    runningTasks,
    runningCount: runningTasks.length,
    isTaskRunning,
    getTask,
  }
}
