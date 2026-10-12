import crypto from "node:crypto"
import type { DecisionBody, PageErrorAction, PendingDecision } from "@adt/types"
import type { BookEventBus } from "./book-event-bus.js"

const DECISION_TIMEOUT_MS = 10 * 60 * 1000
const LISTENER_GRACE_MS = 30 * 1000
const LISTENER_POLL_MS = 1000

export interface RequestDecisionInput {
  label: string
  runId: string
  step: string
  pageId: string
  error: string
  /** Step-scoped stop must also dismiss sibling pending page decisions. */
  signal?: AbortSignal
  errorClass?: PendingDecision["errorClass"]
  attemptCount?: number
  canRetry?: boolean
  validateRetry?: () => void
}

export interface PageErrorDecisions {
  beginRun(label: string, runId: string, signal?: AbortSignal): void
  requestDecision(input: RequestDecisionInput): Promise<PageErrorAction>
  resolveDecision(label: string, body: DecisionBody): boolean
  getPendingDecisions(label: string): PendingDecision[]
  clearForRun(label: string, action?: "skip" | "stop", runId?: string): void
}

export class IneligiblePageRetryError extends Error {
  constructor() {
    super("Retry is unavailable for this page failure")
  }
}

export class StalePageRetryError extends Error {
  constructor() { super("Page inputs changed. Stop or skip this page, then start a refreshed run.") }
}

interface PendingEntry {
  validateRetry?: () => void
  label: string
  value: PendingDecision
  resolve: (action: PageErrorAction) => void
  timer?: ReturnType<typeof setInterval>
  detachAbort?: () => void
}

/** In-memory decisions belong to one live run. No paid work resumes after restart. */
export function createPageErrorDecisions(eventBus: BookEventBus): PageErrorDecisions {
  const pending = new Map<string, PendingEntry>()
  const runs = new Map<string, { id: string; signal?: AbortSignal; bulk?: "skip" | "stop" }>()

  function finish(entry: PendingEntry, action: PageErrorAction): void {
    if (!pending.delete(entry.value.decisionId)) return
    if (entry.timer) clearInterval(entry.timer)
    entry.detachAbort?.()
    entry.resolve(action)
  }
  function clearForRun(label: string, action: "skip" | "stop" = "stop", runId?: string): void {
    if (runId && runs.get(label)?.id !== runId) return
    runs.delete(label)
    for (const entry of [...pending.values()]) {
      if (entry.label === label) finish(entry, action)
    }
  }

  return {
    beginRun(label, runId, signal) {
      clearForRun(label)
      runs.set(label, { id: runId, signal })
    },
    requestDecision(input) {
      const run = runs.get(input.label)
      if (!run || run.id !== input.runId || run.signal?.aborted || input.signal?.aborted)
        return Promise.resolve("stop")
      if (run.bulk) return Promise.resolve(run.bulk)
      const value: PendingDecision = {
        decisionId: crypto.randomUUID(),
        runId: input.runId,
        step: input.step,
        pageId: input.pageId,
        error: input.error,
        errorClass: input.errorClass,
        attemptCount: input.attemptCount,
        canRetry: input.step === "image-meaningfulness" && input.canRetry === true && !!input.validateRetry,
      }
      return new Promise((resolve) => {
        const entry: PendingEntry = { label: input.label, value, resolve, validateRetry: input.validateRetry }
        pending.set(value.decisionId, entry)
        const signals = [run.signal, input.signal].filter(
          (signal): signal is AbortSignal => !!signal,
        )
        const onAbort = () => finish(entry, "stop")
        entry.detachAbort = () => {
          for (const signal of signals) signal.removeEventListener("abort", onAbort)
        }
        for (const signal of signals) signal.addEventListener("abort", onAbort, { once: true })
        const startedAt = Date.now()
        let connectedAt: number | undefined
        let disconnectedAt: number | undefined = startedAt
        const tick = () => {
          if (runs.get(input.label) !== run || run.signal?.aborted) {
            finish(entry, "stop")
            return
          }
          const now = Date.now()
          if (eventBus.hasListeners(input.label)) {
            if (connectedAt === undefined) connectedAt = now
            if (disconnectedAt !== undefined)
              eventBus.emit(input.label, {
                type: "decision-required",
                label: input.label,
                ...value,
              })
            disconnectedAt = undefined
          } else {
            disconnectedAt ??= now
            if (now - disconnectedAt >= LISTENER_GRACE_MS) {
              finish(entry, "stop")
              return
            }
          }
          if (connectedAt !== undefined && now - connectedAt >= DECISION_TIMEOUT_MS)
            finish(entry, "stop")
        }
        entry.timer = setInterval(tick, LISTENER_POLL_MS)
        tick()
      })
    },
    resolveDecision(label, body) {
      const entry = pending.get(body.decisionId)
      const run = runs.get(label)
      if (
        !entry ||
        entry.label !== label ||
        !run ||
        run.id !== entry.value.runId ||
        run.signal?.aborted
      )
        return false
      if (
        (body.runId !== undefined && body.runId !== entry.value.runId) ||
        (body.step !== undefined && body.step !== entry.value.step) ||
        (body.pageId !== undefined && body.pageId !== entry.value.pageId)
      )
        return false
      // Invalid Retry never consumes the pending decision (adapted from #712).
      if (body.action === "retry") {
        if (!entry.value.canRetry || body.applyToAll) throw new IneligiblePageRetryError()
        try { entry.validateRetry?.() } catch { throw new StalePageRetryError() }
      }
      if (body.applyToAll || body.action === "stop") {
        run.bulk = body.action as "skip" | "stop"
        for (const other of [...pending.values()]) {
          if (other.label === label && other.value.runId === run.id) finish(other, body.action)
        }
      } else finish(entry, body.action)
      return true
    },
    getPendingDecisions(label) {
      return [...pending.values()]
        .filter((entry) => entry.label === label)
        .map((entry) => ({ ...entry.value }))
    },
    clearForRun,
  }
}
