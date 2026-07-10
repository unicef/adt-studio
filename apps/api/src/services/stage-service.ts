import { STAGE_ORDER, type ProgressEvent } from "@adt/types"
import type { StageName, StepName, PageErrorPolicy, PageErrorAction } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import type { BookEventBus } from "./book-event-bus.js"
import type { PageErrorDecisions } from "./page-error-decisions.js"

export type StageRunStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"

export interface StageRunJob {
  label: string
  status: StageRunStatus
  fromStage: string
  toStage: string
  error?: string
  startedAt?: number
  completedAt?: number
  /** Per-job cancellation. abort() is called by cancelStageRun. */
  controller: AbortController
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
  /** Cancellation signal for the run. Aborts in-flight LLM calls and stops the
   *  runner at the next checkpoint. Set by the service per job. */
  signal?: AbortSignal
  /** How to react when a page fails inside a per-page step. Defaults to "stop"
   *  (accumulate + fail at the end — the historical behavior). */
  pageErrorPolicy?: PageErrorPolicy
  /** Ask the user how to handle a failed page (only used when pageErrorPolicy
   *  is "ask"). Bound to this run's label by the service. */
  requestPageDecision?: (input: {
    step: StepName
    pageId: string
    error: string
  }) => Promise<PageErrorAction>
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
  /** Request cancellation of the active run. Queued runs are preserved and will
   *  start after the active run unwinds. Returns "cancelling" while the run
   *  unwinds, "cancelled" if only a queue was cleared, or null when there is
   *  nothing to cancel (→ 404). */
  cancelStageRun(label: string): { status: "cancelling" | "cancelled" } | null
}

let nextId = 1

export function createStageService(
  runner: StageRunner,
  eventBus: BookEventBus,
  decisions?: PageErrorDecisions
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

    // Inject the cancellation signal and (interactive-mode) decision hook. Done
    // here — not in the route — so both immediate and queued jobs get the job's
    // own controller and a label-bound broker.
    const effectiveOptions: StageRunOptions = {
      ...options,
      signal: job.controller.signal,
      requestPageDecision: decisions
        ? (input) => decisions.requestDecision({ label, ...input })
        : undefined,
    }

    try {
      options.beforeRun?.()
      await runner.run(label, effectiveOptions, progress)
      // Resolved: either a real completion, or a cancel that landed after the
      // last checkpoint so all remaining work finished. Both are "completed" —
      // no cancelled event, no step reset (the run genuinely finished).
      job.status = "completed"
      job.completedAt = Date.now()
      eventBus.emit(label, { type: "stage-run-complete", label })
    } catch (err) {
      if (job.controller.signal.aborted) {
        // Cancel branch — runs only here, after runner.run() has settled, so the
        // runner is no longer touching step_runs. Return in-flight steps to idle
        // (deliberate action, not a failure) and announce completion of the cancel.
        try {
          const storage = createBookStorage(label, options.booksDir)
          try {
            storage.clearRunningStepRuns()
          } finally {
            storage.close()
          }
        } catch (cleanupErr) {
          console.error(`[stage-run] ${label} cancel cleanup failed:`, cleanupErr)
        }
        job.status = "cancelled"
        job.completedAt = Date.now()
        eventBus.emit(label, { type: "stage-run-cancelled", label })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[stage-run] ${label} failed:`, message)
        job.status = "failed"
        job.error = message
        job.completedAt = Date.now()
        eventBus.emit(label, { type: "stage-run-error", label, error: message })
      }
    } finally {
      // Clear any per-run page-error policy / pending decisions so they never
      // leak into the next run of this book.
      decisions?.clearForRun(label)
    }

    drainQueue(label)
  }

  function drainQueue(label: string): void {
    const state = books.get(label)
    if (!state) return
    if (state.queue.length === 0) {
      // Keep failed jobs so active?.error survives page refresh.
      // Clear completed AND cancelled jobs — their post-run state is fully
      // captured in the DB (cancelled steps are back to idle), so there's
      // nothing to preserve for a refresh.
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
      controller: new AbortController(),
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

      // Queue behind a run that is active OR still unwinding a cancel. Without
      // the "cancelling" case a start during the cancel window would begin
      // immediately, in parallel with the run still tearing down — two runners
      // on one book, and the cancel's cleanup would delete the new run's rows.
      // The post-cancel drainQueue picks this up instead.
      if (
        state.active?.status === "running" ||
        state.active?.status === "cancelling"
      ) {
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
        controller: new AbortController(),
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

    cancelStageRun(
      label: string
    ): { status: "cancelling" | "cancelled" } | null {
      const state = books.get(label)
      const active = state?.active

      // Second click / duplicate request while the cancel is already unwinding:
      // idempotent no-op.
      if (active?.status === "cancelling") {
        return { status: "cancelling" }
      }

      if (active?.status === "running") {
        active.status = "cancelling"
        active.controller.abort()
        // Unblock any pending page-error decision so the runner unwinds now
        // rather than waiting out the safety timeout.
        decisions?.clearForRun(label, "stop")
        // The abort branch of executeJob emits stage-run-cancelled once the
        // runner settles and flips the status to "cancelled".
        return { status: "cancelling" }
      }

      // No active running job. Only a queue to clear (e.g. jobs waiting behind
      // one that already finished, or a hung failed job kept for its error).
      if (state && state.queue.length > 0) {
        state.queue = []
        return { status: "cancelled" }
      }

      // Nothing to cancel — includes a "failed" job pinned as active with no
      // queue. Aborting it would strand isCancelling forever with no executeJob
      // to emit "cancelled".
      return null
    },
  }
}
