import type { TaskKind, TaskInfo, TaskStatus } from "@adt/types"
import type { BookEventBus } from "./book-event-bus.js"

/** Callback to emit progress messages during task execution. */
export type TaskProgressEmitter = (message: string, percent?: number) => void

/** The function that executes the actual work. May return a result payload. */
export type TaskExecutor = (emitProgress: TaskProgressEmitter) => Promise<unknown>

interface BookTaskState {
  tasks: Map<string, TaskInfo>
}

export interface TaskService {
  submitTask(
    label: string,
    kind: TaskKind,
    description: string,
    executor: TaskExecutor,
    options?: { pageId?: string; url?: string }
  ): { taskId: string }

  getActiveTasks(label: string): TaskInfo[]
}

let nextTaskId = 1

export function createTaskService(eventBus: BookEventBus): TaskService {
  const books = new Map<string, BookTaskState>()

  function getOrCreate(label: string): BookTaskState {
    let state = books.get(label)
    if (!state) {
      state = { tasks: new Map() }
      books.set(label, state)
    }
    return state
  }

  function removeTask(label: string, taskId: string): void {
    const state = books.get(label)
    if (state) {
      state.tasks.delete(taskId)
      if (state.tasks.size === 0) {
        books.delete(label)
      }
    }
  }

  return {
    submitTask(
      label: string,
      kind: TaskKind,
      description: string,
      executor: TaskExecutor,
      options?: { pageId?: string; url?: string }
    ): { taskId: string } {
      const taskId = `task-${nextTaskId++}`

      const info: TaskInfo = {
        taskId,
        kind,
        status: "running" as TaskStatus,
        description,
        pageId: options?.pageId,
        url: options?.url,
        startedAt: Date.now(),
      }

      const state = getOrCreate(label)
      state.tasks.set(taskId, info)

      // Emit start event
      eventBus.emit(label, {
        type: "task",
        data: { type: "task-start", taskId, kind, label, description, pageId: options?.pageId, url: options?.url },
      })

      executor((message, percent) => {
        eventBus.emit(label, {
          type: "task",
          data: { type: "task-progress", taskId, message, percent },
        })
      })
        .then((result) => {
          info.status = "completed"
          info.result = result
          info.completedAt = Date.now()
          eventBus.emit(label, {
            type: "task",
            data: { type: "task-complete", taskId, kind, pageId: options?.pageId, result },
          })
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          info.status = "failed"
          info.error = message
          info.completedAt = Date.now()
          eventBus.emit(label, {
            type: "task",
            data: { type: "task-error", taskId, kind, pageId: options?.pageId, error: message },
          })
        })
        .finally(() => {
          // Remove completed/failed tasks after a short delay so clients can read the final state
          setTimeout(() => removeTask(label, taskId), 30_000)
        })

      return { taskId }
    },

    getActiveTasks(label: string): TaskInfo[] {
      const state = books.get(label)
      if (!state) return []
      return [...state.tasks.values()]
    },
  }
}
