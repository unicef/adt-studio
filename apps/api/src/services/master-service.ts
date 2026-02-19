import type { ProgressEvent } from "@adt/types"

export type MasterStatus = "idle" | "running" | "completed" | "failed"

export interface MasterJob {
  label: string
  status: MasterStatus
  error?: string
  startedAt?: number
  completedAt?: number
}

export type MasterSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "master-complete"; label: string }
  | { type: "master-error"; label: string; error: string }

export type MasterEventListener = (event: MasterSSEEvent) => void

export interface StartMasterOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  configPath?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
}

export interface MasterProgress {
  emit(event: ProgressEvent): void
}

export interface MasterRunner {
  run(
    label: string,
    options: StartMasterOptions,
    progress: MasterProgress
  ): Promise<void>
}

export interface MasterService {
  getStatus(label: string): MasterJob | null
  addListener(label: string, listener: MasterEventListener): () => void
  startMaster(
    label: string,
    options: StartMasterOptions
  ): Promise<void>
}

interface MasterJobState extends MasterJob {
  events: MasterSSEEvent[]
}

const MAX_REPLAY_EVENTS = 500

export function createMasterService(runner: MasterRunner): MasterService {
  const jobs = new Map<string, MasterJobState>()
  const listeners = new Map<string, Set<MasterEventListener>>()

  function emit(label: string, event: MasterSSEEvent): void {
    // Buffer event for late-connecting SSE listeners
    const job = jobs.get(label)
    if (job) {
      job.events.push(event)
      if (job.events.length > MAX_REPLAY_EVENTS) {
        job.events.splice(0, job.events.length - MAX_REPLAY_EVENTS)
      }
    }

    const set = listeners.get(label)
    if (!set) return
    for (const listener of set) {
      try {
        listener(event)
      } catch {
        // Listener errors should not crash the runner
      }
    }
  }

  return {
    getStatus(label: string): MasterJob | null {
      const job = jobs.get(label)
      if (!job) return null
      const { events: _events, ...publicJob } = job
      return publicJob
    },

    addListener(
      label: string,
      listener: MasterEventListener
    ): () => void {
      // Replay buffered events so late-connecting listeners catch up
      const job = jobs.get(label)
      if (job) {
        for (const event of job.events) {
          try {
            listener(event)
          } catch {
            // Listener errors should not crash the runner
          }
        }
      }

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

    async startMaster(
      label: string,
      options: StartMasterOptions
    ): Promise<void> {
      const existing = jobs.get(label)
      if (existing?.status === "running") {
        throw new Error(`Master generation already running for book: ${label}`)
      }

      const job: MasterJobState = {
        label,
        status: "running",
        startedAt: Date.now(),
        events: [],
      }
      jobs.set(label, job)

      const progress: MasterProgress = {
        emit(event: ProgressEvent) {
          emit(label, { type: "progress", data: event })
        },
      }

      try {
        await runner.run(label, options, progress)
        job.status = "completed"
        job.completedAt = Date.now()
        emit(label, { type: "master-complete", label })
        job.events = []
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        job.status = "failed"
        job.error = message
        job.completedAt = Date.now()
        emit(label, { type: "master-error", label, error: message })
        job.events = []
      }
    },
  }
}
