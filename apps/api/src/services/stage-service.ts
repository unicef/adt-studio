import { STAGE_ORDER, type ProgressEvent } from "@adt/types"
import type { StageName } from "@adt/types"

export type StageRunStatus = "idle" | "running" | "completed" | "failed"

export interface StageRunJob {
  label: string
  status: StageRunStatus
  fromStage: string
  toStage: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface QueuedStageRun {
  id: string
  fromStage: string
  toStage: string
  options: StageRunOptions
}

interface BookRunState {
  active: StageRunJob | null
  queue: QueuedStageRun[]
}

export interface BookRunStatus {
  active: StageRunJob | null
  queue: Array<{ id: string; fromStage: string; toStage: string }>
}

export type StageSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "stage-run-complete"; label: string }
  | { type: "stage-run-error"; label: string; error: string }
  | { type: "queue-next"; label: string; fromStage: string; toStage: string }

export type StageEventListener = (event: StageSSEEvent) => void

export interface StageRunOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  configPath?: string
  fromStage: string
  toStage: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  beforeRun?: () => void
}

export interface StageRunProgress {
  emit(event: ProgressEvent): void
}

export interface StageRunner {
  run(
    label: string,
    options: StageRunOptions,
    progress: StageRunProgress
  ): Promise<void>
}

export type RunStageState = "running" | "queued" | "error"

export interface StageService {
  getStatus(label: string): BookRunStatus
  /** Get the run-derived state for each stage (running/queued/error). Stages not returned are idle from the run perspective. */
  getStageStates(label: string): Partial<Record<StageName, RunStageState>>
  addListener(label: string, listener: StageEventListener): () => void
  startStageRun(
    label: string,
    options: StageRunOptions
  ): { status: "started" | "queued"; id: string }
}

let nextId = 1

export function createStageService(
  runner: StageRunner
): StageService {
  const books = new Map<string, BookRunState>()
  const listeners = new Map<string, Set<StageEventListener>>()

  function getOrCreateState(label: string): BookRunState {
    let state = books.get(label)
    if (!state) {
      state = { active: null, queue: [] }
      books.set(label, state)
    }
    return state
  }

  function emit(label: string, event: StageSSEEvent): void {
    const set = listeners.get(label)
    if (!set) return
    for (const listener of set) {
      try {
        listener(event)
      } catch {
        // Listener errors should not crash the stage run
      }
    }
  }

  async function executeJob(
    label: string,
    job: StageRunJob,
    options: StageRunOptions
  ): Promise<void> {
    const progress: StageRunProgress = {
      emit(event: ProgressEvent) {
        emit(label, { type: "progress", data: event })
      },
    }

    try {
      options.beforeRun?.()
      await runner.run(label, options, progress)
      job.status = "completed"
      job.completedAt = Date.now()
      emit(label, { type: "stage-run-complete", label })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[stage-run] ${label} failed:`, message)
      job.status = "failed"
      job.error = message
      job.completedAt = Date.now()
      emit(label, { type: "stage-run-error", label, error: message })
    }

    drainQueue(label)
  }

  function drainQueue(label: string): void {
    const state = books.get(label)
    if (!state) return
    if (state.queue.length === 0) {
      // Do not keep stale completed/failed jobs as active. Leaving them here
      // makes a fresh SSE connection immediately emit complete/error and close.
      state.active = null
      return
    }

    const next = state.queue.shift()!
    const job: StageRunJob = {
      label,
      status: "running",
      fromStage: next.fromStage,
      toStage: next.toStage,
      startedAt: Date.now(),
    }
    state.active = job

    emit(label, {
      type: "queue-next",
      label,
      fromStage: next.fromStage,
      toStage: next.toStage,
    })

    executeJob(label, job, next.options).catch(() => {})
  }

  return {
    getStatus(label: string): BookRunStatus {
      const state = books.get(label)
      if (!state) return { active: null, queue: [] }
      return {
        active: state.active,
        queue: state.queue.map((q) => ({
          id: q.id,
          fromStage: q.fromStage,
          toStage: q.toStage,
        })),
      }
    },

    getStageStates(label: string): Partial<Record<StageName, RunStageState>> {
      const state = books.get(label)
      if (!state) return {}
      const out: Partial<Record<StageName, RunStageState>> = {}

      // Active run — mark stages in its range
      if (state.active) {
        const { status, fromStage, toStage, error } = state.active
        const from = STAGE_ORDER.indexOf(fromStage as StageName)
        const to = STAGE_ORDER.indexOf(toStage as StageName)
        if (from !== -1 && to !== -1) {
          for (let i = from; i <= to; i++) {
            if (status === "running") {
              out[STAGE_ORDER[i]] = "running"
            } else if (status === "failed") {
              out[STAGE_ORDER[i]] = "error"
            }
            // completed → handled by DB step_completions, not here
          }
        }
      }

      // Queued runs — mark stages in their ranges
      for (const q of state.queue) {
        const from = STAGE_ORDER.indexOf(q.fromStage as StageName)
        const to = STAGE_ORDER.indexOf(q.toStage as StageName)
        if (from !== -1 && to !== -1) {
          for (let i = from; i <= to; i++) {
            // Don't overwrite "running" with "queued"
            if (!out[STAGE_ORDER[i]]) {
              out[STAGE_ORDER[i]] = "queued"
            }
          }
        }
      }

      return out
    },

    addListener(
      label: string,
      listener: StageEventListener
    ): () => void {
      let set = listeners.get(label)
      if (!set) {
        set = new Set()
        listeners.set(label, set)
      }
      set.add(listener)

      return () => {
        set!.delete(listener)
        if (set!.size === 0) {
          listeners.delete(label)
        }
      }
    },

    startStageRun(
      label: string,
      options: StageRunOptions
    ): { status: "started" | "queued"; id: string } {
      const state = getOrCreateState(label)
      const id = String(nextId++)

      if (state.active?.status === "running") {
        // Queue behind the active run
        state.queue.push({
          id,
          fromStage: options.fromStage,
          toStage: options.toStage,
          options,
        })
        return { status: "queued", id }
      }

      // Start immediately
      const job: StageRunJob = {
        label,
        status: "running",
        fromStage: options.fromStage,
        toStage: options.toStage,
        startedAt: Date.now(),
      }
      state.active = job

      executeJob(label, job, options).catch(() => {})

      return { status: "started", id }
    },
  }
}
