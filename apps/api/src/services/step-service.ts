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

export type StepSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "step-run-complete"; label: string }
  | { type: "step-run-error"; label: string; error: string }

export type StepEventListener = (event: StepSSEEvent) => void

export interface StepRunOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  configPath?: string
  fromStep: string
  toStep: string
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
  getStatus(label: string): StepRunJob | null
  addListener(label: string, listener: StepEventListener): () => void
  startStepRun(label: string, options: StepRunOptions): Promise<void>
}

export function createStepService(
  runner: StepRunner,
  pipelineService: PipelineService
): StepService {
  const jobs = new Map<string, StepRunJob>()
  const listeners = new Map<string, Set<StepEventListener>>()

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

  return {
    getStatus(label: string): StepRunJob | null {
      return jobs.get(label) ?? null
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

    async startStepRun(
      label: string,
      options: StepRunOptions
    ): Promise<void> {
      // Check for conflicts with full pipeline
      const pipelineJob = pipelineService.getStatus(label)
      if (pipelineJob?.status === "running") {
        throw new Error(`Full pipeline already running for book: ${label}`)
      }

      const existing = jobs.get(label)
      if (existing?.status === "running") {
        throw new Error(`Step run already in progress for book: ${label}`)
      }

      const job: StepRunJob = {
        label,
        status: "running",
        fromStep: options.fromStep,
        toStep: options.toStep,
        startedAt: Date.now(),
      }
      jobs.set(label, job)

      const progress: StepRunProgress = {
        emit(event: ProgressEvent) {
          emit(label, { type: "progress", data: event })
        },
      }

      try {
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
    },
  }
}
