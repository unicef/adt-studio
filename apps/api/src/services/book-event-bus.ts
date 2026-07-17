import type { ProgressEvent, TaskEvent } from "@adt/types"

export type BookSSEEvent =
  | { type: "progress"; data: ProgressEvent }
  | { type: "stage-run-complete"; label: string }
  | { type: "stage-run-error"; label: string; error: string }
  | { type: "stage-run-cancelled"; label: string }
  | { type: "queue-next"; label: string; fromStage: string; toStage: string }
  | {
      type: "decision-required"
      label: string
      decisionId: string
      step: string
      pageId: string
      error: string
    }
  | { type: "task"; data: TaskEvent }

export type BookEventListener = (event: BookSSEEvent) => void

export interface BookEventBus {
  emit(label: string, event: BookSSEEvent): void
  addListener(label: string, listener: BookEventListener): () => void
  /** Whether at least one SSE listener is currently connected for a label.
   *  Used by the page-error decision broker to detect a closed tab/app. */
  hasListeners(label: string): boolean
}

export function createBookEventBus(): BookEventBus {
  const listeners = new Map<string, Set<BookEventListener>>()

  return {
    emit(label: string, event: BookSSEEvent): void {
      const set = listeners.get(label)
      if (!set) return
      for (const listener of set) {
        try {
          listener(event)
        } catch {
          // Listener errors should not crash the emitter
        }
      }
    },

    addListener(label: string, listener: BookEventListener): () => void {
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

    hasListeners(label: string): boolean {
      const set = listeners.get(label)
      return !!set && set.size > 0
    },
  }
}
