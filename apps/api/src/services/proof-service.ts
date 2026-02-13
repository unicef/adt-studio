import type { ProgressEvent } from "@adt/types"

export type ProofStatus = "idle" | "running" | "completed" | "failed"

export interface ProofJob {
  label: string
  status: ProofStatus
  error?: string
  startedAt?: number
  completedAt?: number
}

export type ProofSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "proof-complete"; label: string }
  | { type: "proof-error"; label: string; error: string }

export type ProofEventListener = (event: ProofSSEEvent) => void

export interface StartProofOptions {
  booksDir: string
  apiKey: string
  promptsDir: string
  configPath?: string
}

export interface ProofProgress {
  emit(event: ProgressEvent): void
}

export interface ProofRunner {
  run(
    label: string,
    options: StartProofOptions,
    progress: ProofProgress
  ): Promise<void>
}

export interface ProofService {
  getStatus(label: string): ProofJob | null
  addListener(label: string, listener: ProofEventListener): () => void
  startProof(
    label: string,
    options: StartProofOptions
  ): Promise<void>
}

export function createProofService(runner: ProofRunner): ProofService {
  const jobs = new Map<string, ProofJob>()
  const listeners = new Map<string, Set<ProofEventListener>>()

  function emit(label: string, event: ProofSSEEvent): void {
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
    getStatus(label: string): ProofJob | null {
      return jobs.get(label) ?? null
    },

    addListener(
      label: string,
      listener: ProofEventListener
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

    async startProof(
      label: string,
      options: StartProofOptions
    ): Promise<void> {
      const existing = jobs.get(label)
      if (existing?.status === "running") {
        throw new Error(`Proof generation already running for book: ${label}`)
      }

      const job: ProofJob = {
        label,
        status: "running",
        startedAt: Date.now(),
      }
      jobs.set(label, job)

      const progress: ProofProgress = {
        emit(event: ProgressEvent) {
          emit(label, { type: "progress", data: event })
        },
      }

      try {
        await runner.run(label, options, progress)
        job.status = "completed"
        job.completedAt = Date.now()
        emit(label, { type: "proof-complete", label })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        job.status = "failed"
        job.error = message
        job.completedAt = Date.now()
        emit(label, { type: "proof-error", label, error: message })
      }
    },
  }
}
