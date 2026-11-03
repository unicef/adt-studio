import {
  PUBLISH_STEPS,
  type PublishProgressEvent,
  type PublishRunSnapshot,
  type PublishStepStatus,
} from "@adt/types"

export type { PublishRunSnapshot }

/**
 * In-memory live view of each book's share run.
 *
 * A run is driven over SSE, and the browser drops that stream whenever the tab reloads or the
 * author moves to another stage — but the run keeps going on the server to the end. Without this,
 * a page that comes back mid-run offers "Share and get a link" for a book that is about to be
 * online, and pressing it again answers with a failure for a share that is succeeding.
 *
 * One slot per book, because the route's in-flight guard allows one run per book. The terminal
 * snapshot is kept rather than cleared, so a page that reconnects after the run finished still
 * learns how it ended.
 *
 * It also carries the author's Stop. Closing the stream cannot stop a run any more — the server
 * finishes what the browser left — so Stop is a request the run itself checks at its next event.
 * Once the link is being created it is refused: stopping there could leave a half-made link.
 */
/** Thrown out of a run's `emit` when the author asked it to stop. */
export class PublishCancelledError extends Error {
  constructor() {
    super("The author stopped sharing before it finished")
    this.name = "PublishCancelledError"
  }
}

export interface PublishRunView {
  begin: (label: string, kind: PublishRunSnapshot["kind"]) => void
  /** Records an event, and throws `PublishCancelledError` if a stop is waiting and it is still
   *  safe to honour — which is the run's only way of hearing about it. */
  record: (label: string, event: PublishProgressEvent) => void
  cancelled: (label: string) => void
  requestCancel: (label: string) => boolean
  get: (label: string) => PublishRunSnapshot | null
  running: () => { label: string; run: PublishRunSnapshot }[]
}

const REGISTER_STEP = PUBLISH_STEPS.findIndex((step) => step.id === "register")

export function createPublishRunView(now: () => Date = () => new Date()): PublishRunView {
  const runs = new Map<string, PublishRunSnapshot>()
  const stopRequested = new Set<string>()

  const finish = (run: PublishRunSnapshot, status: PublishRunSnapshot["status"]) => {
    run.status = status
    run.active_step = null
    run.progress = null
    run.finished_at = now().toISOString()
  }

  const registering = (run: PublishRunSnapshot) =>
    REGISTER_STEP >= 0 && run.step_states[REGISTER_STEP] === "running"

  return {
    begin(label, kind) {
      stopRequested.delete(label)
      runs.set(label, {
        kind,
        status: "running",
        step_states: PUBLISH_STEPS.map((): PublishStepStatus => "pending"),
        active_step: null,
        progress: null,
        failure: null,
        result: null,
        started_at: now().toISOString(),
        finished_at: null,
      })
    },

    record(label, event) {
      const run = runs.get(label)
      if (!run || run.status !== "running") return

      if (event.type === "step") {
        const index = event.number - 1
        if (index >= 0 && index < run.step_states.length) run.step_states[index] = event.status
        if (event.status === "running") run.active_step = event.number
        run.progress =
          event.status === "running" && event.total !== undefined && event.done !== undefined
            ? { done: event.done, total: event.total, unit: event.unit ?? "files" }
            : event.status === "running"
              ? run.progress
              : null
        if (stopRequested.has(label) && !registering(run)) throw new PublishCancelledError()
        return
      }

      if (event.type === "complete") {
        run.step_states = run.step_states.map(() => "done")
        run.result = { url: event.url, publication: event.publication }
        finish(run, "done")
        stopRequested.delete(label)
        return
      }

      run.step_states = run.step_states.map((value) => (value === "running" ? "error" : value))
      run.failure = { code: event.code, message: event.message, step_id: event.step_id }
      finish(run, "error")
      stopRequested.delete(label)
    },

    cancelled(label) {
      const run = runs.get(label)
      stopRequested.delete(label)
      if (!run || run.status !== "running") return
      finish(run, "cancelled")
    },

    requestCancel(label) {
      const run = runs.get(label)
      if (!run || run.status !== "running" || registering(run)) return false
      stopRequested.add(label)
      return true
    },

    get(label) {
      const run = runs.get(label)
      return run ? { ...run, step_states: [...run.step_states] } : null
    },

    running() {
      return [...runs.entries()]
        .filter(([, run]) => run.status === "running")
        .map(([label, run]) => ({ label, run: { ...run, step_states: [...run.step_states] } }))
    },
  }
}
