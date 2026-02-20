import type { ProgressEvent } from "@adt/types"
import type { PipelineService } from "./pipeline-service.js"

export type StepRunStatus = "idle" | "running" | "completed" | "failed"

export interface StepRunJob {
  label: string
  status: StepRunStatus
  fromStep: string
  toStep: string
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface QueuedStepRun {
  id: string
  fromStep: string
  toStep: string
  options: StepRunOptions
}

interface BookRunState {
  active: StepRunJob | null
  queue: QueuedStepRun[]
}

export interface BookRunStatus {
  active: StepRunJob | null
  queue: Array<{ id: string; fromStep: string; toStep: string }>
}

export type StepSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "step-run-complete"; label: string }
  | { type: "step-run-error"; label: string; error: string }
  | { type: "queue-next"; label: string; fromStep: string; toStep: string }

export type StepEventListener = (event: StepSSEEvent) => void

export interface StepRunOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  configPath?: string
  fromStep: string
  toStep: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  beforeRun?: () => void
}

export interface StepRunProgress {
  emit(event: ProgressEvent): void
}

export interface StepRunner {
  run(
    label: string,
    options: StepRunOptions,
    progress: StepRunProgress
  ): Promise<void>
}

export interface StepService {
  getStatus(label: string): BookRunStatus
  addListener(label: string, listener: StepEventListener): () => void
  startStepRun(
    label: string,
    options: StepRunOptions
  ): { status: "started" | "queued"; id: string }
}

let nextId = 1

export function createStepService(
  runner: StepRunner,
  pipelineService: PipelineService
): StepService {
  const books = new Map<string, BookRunState>()
  const listeners = new Map<string, Set<StepEventListener>>()

  function getOrCreateState(label: string): BookRunState {
    let state = books.get(label)
    if (!state) {
      state = { active: null, queue: [] }
      books.set(label, state)
    }
    return state
  }

  function emit(label: string, event: StepSSEEvent): void {
    const set = listeners.get(label)
    if (!set) return
    for (const listener of set) {
      try {
        listener(event)
      } catch {
        // Listener errors should not crash the step run
      }
    }
  }

  async function executeJob(
    label: string,
    job: StepRunJob,
    options: StepRunOptions
  ): Promise<void> {
    const progress: StepRunProgress = {
      emit(event: ProgressEvent) {
        emit(label, { type: "progress", data: event })
      },
    }

    try {
      options.beforeRun?.()
      await runner.run(label, options, progress)
      job.status = "completed"
      job.completedAt = Date.now()
      emit(label, { type: "step-run-complete", label })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[step-run] ${label} failed:`, message)
      job.status = "failed"
      job.error = message
      job.completedAt = Date.now()
      emit(label, { type: "step-run-error", label, error: message })
    }

    drainQueue(label)
  }

  function drainQueue(label: string): void {
    const state = books.get(label)
    if (!state || state.queue.length === 0) return

    const next = state.queue.shift()!
    const job: StepRunJob = {
      label,
      status: "running",
      fromStep: next.fromStep,
      toStep: next.toStep,
      startedAt: Date.now(),
    }
    state.active = job

    emit(label, {
      type: "queue-next",
      label,
      fromStep: next.fromStep,
      toStep: next.toStep,
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
          fromStep: q.fromStep,
          toStep: q.toStep,
        })),
      }
    },

    addListener(
      label: string,
      listener: StepEventListener
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

    startStepRun(
      label: string,
      options: StepRunOptions
    ): { status: "started" | "queued"; id: string } {
      // Check for conflicts with full pipeline
      const pipelineJob = pipelineService.getStatus(label)
      if (pipelineJob?.status === "running") {
        throw new Error(`Full pipeline already running for book: ${label}`)
      }

      const state = getOrCreateState(label)
      const id = String(nextId++)

      if (state.active?.status === "running") {
        // Queue behind the active run
        state.queue.push({
          id,
          fromStep: options.fromStep,
          toStep: options.toStep,
          options,
        })
        return { status: "queued", id }
      }

      // Start immediately
      const job: StepRunJob = {
        label,
        status: "running",
        fromStep: options.fromStep,
        toStep: options.toStep,
        startedAt: Date.now(),
      }
      state.active = job

      executeJob(label, job, options).catch(() => {})

      return { status: "started", id }
    },
  }
}
