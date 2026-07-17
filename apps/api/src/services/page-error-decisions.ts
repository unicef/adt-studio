import crypto from "node:crypto"
import type { PageErrorAction, PendingDecision } from "@adt/types"
import type { BookEventBus } from "./book-event-bus.js"

/** Safety net when a UI is connected but the user walks away. */
const DECISION_TIMEOUT_MS = 10 * 60 * 1000
/** Wait this long for an SSE listener to (re)connect before assuming the tab is
 *  really gone. Covers the reconnect blip inherent to the SSE+polling hybrid. */
const LISTENER_GRACE_MS = 30 * 1000
/** Poll cadence while waiting out the grace period. */
const LISTENER_POLL_MS = 1000

export interface RequestDecisionInput {
  label: string
  step: string
  pageId: string
  error: string
}

export interface PageErrorDecisions {
  /** Ask the user how to handle a failed page. Resolves to the chosen action.
   *  Falls back to "stop" on timeout or when no UI is reachable. */
  requestDecision(input: RequestDecisionInput): Promise<PageErrorAction>
  /** Resolve a pending decision (from the UI). Returns false if the id is
   *  unknown (already resolved by timeout/cancel — the caller returns 409). */
  resolveDecision(
    decisionId: string,
    action: PageErrorAction,
    applyToAll?: boolean
  ): boolean
  /** Pending decisions for a label — consumed by the polled step-status. */
  getPendingDecisions(label: string): PendingDecision[]
  /** Resolve every pending decision for a label and drop its apply-to-all
   *  policy. Called at run end (success/error) and cancel. Defaults to "stop". */
  clearForRun(label: string, action?: PageErrorAction): void
}

interface PendingEntry {
  decisionId: string
  label: string
  step: string
  pageId: string
  error: string
  resolve: (action: PageErrorAction) => void
  resolved: boolean
  safetyTimer?: ReturnType<typeof setTimeout>
  graceTimer?: ReturnType<typeof setInterval>
}

export function createPageErrorDecisions(
  eventBus: BookEventBus
): PageErrorDecisions {
  const pending = new Map<string, PendingEntry>()
  // Per-label "apply to all" policy set once the user checks the box.
  const bulkPolicy = new Map<string, PageErrorAction>()

  function finish(entry: PendingEntry, action: PageErrorAction): void {
    if (entry.resolved) return
    entry.resolved = true
    if (entry.safetyTimer) clearTimeout(entry.safetyTimer)
    if (entry.graceTimer) clearInterval(entry.graceTimer)
    pending.delete(entry.decisionId)
    entry.resolve(action)
  }

  /** Surface a pending decision to a connected UI and arm the safety timeout. */
  function arm(entry: PendingEntry): void {
    eventBus.emit(entry.label, {
      type: "decision-required",
      label: entry.label,
      decisionId: entry.decisionId,
      step: entry.step,
      pageId: entry.pageId,
      error: entry.error,
    })
    entry.safetyTimer = setTimeout(() => finish(entry, "stop"), DECISION_TIMEOUT_MS)
  }

  return {
    requestDecision(input: RequestDecisionInput): Promise<PageErrorAction> {
      // Honor a previously chosen "apply to all" without prompting again.
      const bulk = bulkPolicy.get(input.label)
      if (bulk) return Promise.resolve(bulk)

      const decisionId = crypto.randomUUID()
      return new Promise<PageErrorAction>((resolve) => {
        const entry: PendingEntry = {
          decisionId,
          label: input.label,
          step: input.step,
          pageId: input.pageId,
          error: input.error,
          resolve,
          resolved: false,
        }
        // Consultable immediately (a poll landing during the grace period sees it).
        pending.set(decisionId, entry)

        if (eventBus.hasListeners(input.label)) {
          arm(entry)
          return
        }

        // No UI connected — a genuinely closed tab, or a reconnect blip. Wait a
        // short grace period for a listener to (re)appear before falling back to
        // "stop"; if one does, surface the dialog and switch to the 10-min timeout.
        const startedAt = Date.now()
        entry.graceTimer = setInterval(() => {
          if (entry.resolved) return
          if (eventBus.hasListeners(input.label)) {
            clearInterval(entry.graceTimer)
            entry.graceTimer = undefined
            arm(entry)
          } else if (Date.now() - startedAt >= LISTENER_GRACE_MS) {
            finish(entry, "stop")
          }
        }, LISTENER_POLL_MS)
      })
    },

    resolveDecision(
      decisionId: string,
      action: PageErrorAction,
      applyToAll?: boolean
    ): boolean {
      const entry = pending.get(decisionId)
      if (!entry) return false
      if (applyToAll) {
        bulkPolicy.set(entry.label, action)
        // Apply the bulk decision to every other pending decision for this label.
        for (const other of [...pending.values()]) {
          if (other.label === entry.label && other.decisionId !== decisionId) {
            finish(other, action)
          }
        }
      }
      finish(entry, action)
      return true
    },

    getPendingDecisions(label: string): PendingDecision[] {
      const result: PendingDecision[] = []
      for (const entry of pending.values()) {
        if (entry.label === label && !entry.resolved) {
          result.push({
            decisionId: entry.decisionId,
            step: entry.step,
            pageId: entry.pageId,
            error: entry.error,
          })
        }
      }
      return result
    },

    clearForRun(label: string, action: PageErrorAction = "stop"): void {
      bulkPolicy.delete(label)
      for (const entry of [...pending.values()]) {
        if (entry.label === label) finish(entry, action)
      }
    },
  }
}
