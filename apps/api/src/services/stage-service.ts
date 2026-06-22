import { STAGE_ORDER, type ProgressEvent } from "@adt/types"
import type { StageName } from "@adt/types"
import type { BookEventBus } from "./book-event-bus.js"

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

export interface StageRunOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  webAssetsDir?: string
  configPath?: string
  fromStage: string
  toStage: string
  /** When true, skip page-sectioning and only re-render from existing section data. */
  renderOnly?: boolean
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  geminiApiKey?: string
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

export interface StageService {
  getStatus(label: string): BookRunStatus
  /** Get stage names that are queued (waiting to run). */
  getQueuedStages(label: string): StageName[]
  startStageRun(
    label: string,
    options: StageRunOptions
  ): { status: "started" | "queued"; id: string }
}

let nextId = 1

export function createStageService(
  runner: StageRunner,
  eventBus: BookEventBus
): StageService {
  const books = new Map<string, BookRunState>()

  function getOrCreateState(label: string): BookRunState {
    let state = books.get(label)
    if (!state) {
      state = { active: null, queue: [] }
      books.set(label, state)
    }
    return state
  }

  async function executeJob(
    label: string,
    job: StageRunJob,
    options: StageRunOptions
  ): Promise<void> {
    const progress: StageRunProgress = {
      emit(event: ProgressEvent) {
        eventBus.emit(label, { type: "progress", data: event })
      },
    }

    try {
      options.beforeRun?.()
      await runner.run(label, options, progress)
      job.status = "completed"
      job.completedAt = Date.now()
      eventBus.emit(label, { type: "stage-run-complete", label })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[stage-run] ${label} failed:`, message)
      job.status = "failed"
      job.error = message
      job.completedAt = Date.now()
      eventBus.emit(label, { type: "stage-run-error", label, error: message })
    }

    drainQueue(label)
  }

  function drainQueue(label: string): void {
    const state = books.get(label)
    if (!state) return
    if (state.queue.length === 0) {
      // Keep failed jobs so active?.error survives page refresh.
      // Only clear completed jobs — their state is fully captured in the DB.
      if (state.active?.status !== "failed") {
        state.active = null
      }
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

    eventBus.emit(label, {
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

    getQueuedStages(label: string): StageName[] {
      const state = books.get(label)
      if (!state) return []
      const queued = new Set<StageName>()

      for (const q of state.queue) {
        const from = STAGE_ORDER.indexOf(q.fromStage as StageName)
        const to = STAGE_ORDER.indexOf(q.toStage as StageName)
        if (from !== -1 && to !== -1) {
          for (let i = from; i <= to; i++) {
            queued.add(STAGE_ORDER[i])
          }
        }
      }

      return [...queued]
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

      // Defer execution to the next macrotask so this call — and the HTTP
      // response that triggered it — returns before the job's synchronous
      // startup runs. A stage's setup (e.g. extract: reading the PDF off disk,
      // parsing it via WASM, extracting the first page) runs synchronously up
      // to its first await and would otherwise block the response for several
      // seconds, stalling the client that just kicked off the run. `state.active`
      // is already set, so getStatus() reflects "running" right away; the step
      // run record is written once the deferred job actually starts.
      setImmediate(() => {
        executeJob(label, job, options).catch(() => {})
      })

      return { status: "started", id }
    },
  }
}
