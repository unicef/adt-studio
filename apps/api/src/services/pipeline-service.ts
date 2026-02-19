import type { ProgressEvent } from "@adt/types"

export type PipelineStatus = "idle" | "running" | "completed" | "failed"

export interface PipelineJob {
  label: string
  status: PipelineStatus
  error?: string
  startedAt?: number
  completedAt?: number
}

export type PipelineSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "pipeline-complete"; label: string }
  | { type: "pipeline-error"; label: string; error: string }

export type PipelineEventListener = (event: PipelineSSEEvent) => void

export interface StartPipelineOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  configPath?: string
  startPage?: number
  endPage?: number
  azureSpeechKey?: string
  azureSpeechRegion?: string
}

export interface PipelineProgress {
  emit(event: ProgressEvent): void
}

export interface PipelineRunner {
  run(
    label: string,
    options: StartPipelineOptions,
    progress: PipelineProgress
  ): Promise<void>
}

export interface PipelineService {
  getStatus(label: string): PipelineJob | null
  addListener(label: string, listener: PipelineEventListener): () => void
  startPipeline(
    label: string,
    options: StartPipelineOptions
  ): Promise<void>
}

export function createPipelineService(runner: PipelineRunner): PipelineService {
  const jobs = new Map<string, PipelineJob>()
  const listeners = new Map<string, Set<PipelineEventListener>>()

  function emit(label: string, event: PipelineSSEEvent): void {
    const set = listeners.get(label)
    if (!set) return
    for (const listener of set) {
      try {
        listener(event)
      } catch {
        // Listener errors should not crash the pipeline
      }
    }
  }

  return {
    getStatus(label: string): PipelineJob | null {
      return jobs.get(label) ?? null
    },

    addListener(
      label: string,
      listener: PipelineEventListener
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

    async startPipeline(
      label: string,
      options: StartPipelineOptions
    ): Promise<void> {
      const existing = jobs.get(label)
      if (existing?.status === "running") {
        throw new Error(`Pipeline already running for book: ${label}`)
      }

      const job: PipelineJob = {
        label,
        status: "running",
        startedAt: Date.now(),
      }
      jobs.set(label, job)

      const progress: PipelineProgress = {
        emit(event: ProgressEvent) {
          emit(label, { type: "progress", data: event })
        },
      }

      try {
        await runner.run(label, options, progress)
        job.status = "completed"
        job.completedAt = Date.now()
        emit(label, { type: "pipeline-complete", label })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        job.status = "failed"
        job.error = message
        job.completedAt = Date.now()
        emit(label, { type: "pipeline-error", label, error: message })
      }
    },
  }
}
