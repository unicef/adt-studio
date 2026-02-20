import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { getTargetStepsForRange } from "./step-run-range"
import { STEP_TO_STAGE, getStageClearOrder } from "@adt/types"
import type { StageName } from "@adt/types"
import {
  getInvalidationKeysForUiStep,
  getMetadataInvalidationKeys,
  getStartInvalidationKeysForUiStep,
  type QueryKey,
} from "./step-run-invalidation"

export type UIStepState = "idle" | "queued" | "running" | "done" | "error"

export interface UIStepProgress {
  state: UIStepState
  /** 0-1 progress fraction, only meaningful when state is "running" */
  progress: number
  page?: number
  totalPages?: number
}

export interface SubStepProgress {
  state: UIStepState
  page?: number
  totalPages?: number
}

export interface StepRunProgress {
  isRunning: boolean
  isComplete: boolean
  error: string | null
  /** Which UI steps are part of this run (from fromStep..toStep) */
  targetSteps: Set<string>
  /** Per UI-step progress state */
  steps: Map<string, UIStepProgress>
  /** Per pipeline sub-step progress (e.g. "extract", "metadata", "text-classification") */
  subSteps: Map<string, SubStepProgress>
}

const INITIAL: StepRunProgress = {
  isRunning: false,
  isComplete: false,
  error: null,
  targetSteps: new Set(),
  steps: new Map(),
  subSteps: new Map(),
}

function invalidateQueryKeys(qc: QueryClient, keys: QueryKey[]) {
  for (const key of keys) {
    qc.invalidateQueries({ queryKey: key })
  }
}


/** Check whether any steps are still queued in the progress state. */
function hasQueuedSteps(steps: Map<string, UIStepProgress>): boolean {
  for (const info of steps.values()) {
    if (info.state === "queued") return true
  }
  return false
}

function invalidateBookQueries(qc: QueryClient, label: string) {
  qc.invalidateQueries({ queryKey: ["books", label] })
  qc.invalidateQueries({ queryKey: ["books"] })
  qc.invalidateQueries({ queryKey: ["books", label, "pages"] })
  qc.invalidateQueries({ queryKey: ["books", label, "step-status"] })
  qc.invalidateQueries({ queryKey: ["debug"] })
}

export function useStepRunSSE(label: string, enabled: boolean) {
  const [progress, setProgress] = useState<StepRunProgress>(INITIAL)
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !label) {
      return
    }

    setProgress((prev) => ({
      ...prev,
      isRunning: true,
      isComplete: false,
      error: null,
    }))

    const url = `/api/books/${label}/steps/status`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data)
      const pipelineStep = data.step as string
      const uiStep = (STEP_TO_STAGE as Record<string, string>)[pipelineStep]
      if (!uiStep) return

      setProgress((prev) => {
        const steps = new Map(prev.steps)
        const subSteps = new Map(prev.subSteps)

        if (data.type === "step-start") {
          const existing = steps.get(uiStep)
          if (!existing || existing.state === "idle" || existing.state === "queued") {
            steps.set(uiStep, { state: "running", progress: 0 })
          }
          subSteps.set(pipelineStep, { state: "running" })
        } else if (data.type === "step-progress" && data.totalPages) {
          const page = data.page ?? 0
          const total = data.totalPages
          const pct = total > 0 ? page / total : 0
          const existing = steps.get(uiStep)
          // Only update if this sub-step is slower (lower progress)
          if (!existing || existing.state !== "running" || pct <= existing.progress || existing.progress === 0) {
            steps.set(uiStep, { state: "running", progress: pct, page, totalPages: total })
          }
          subSteps.set(pipelineStep, { state: "running", page, totalPages: total })
        } else if (data.type === "step-complete" || data.type === "step-skip") {
          subSteps.set(pipelineStep, { state: "done" })
        } else if (data.type === "step-error") {
          steps.set(uiStep, { state: "error", progress: 0 })
          subSteps.set(pipelineStep, { state: "error" })
        }

        return { ...prev, steps, subSteps }
      })

      // Step completed — the step runner wrote to step_completions,
      // so refetch step-status to pick up stage completion from the DB.
      if (data.type === "step-complete" || data.type === "step-skip") {
        invalidateQueryKeys(queryClient, getInvalidationKeysForUiStep(label, uiStep))
      }
      if (data.type === "step-complete" && pipelineStep === "metadata") {
        invalidateQueryKeys(queryClient, getMetadataInvalidationKeys(label))
      }
    })

    // A queued run has started executing
    es.addEventListener("queue-next", (e) => {
      const data = JSON.parse(e.data)
      const rangeSteps = getTargetStepsForRange(data.fromStep, data.toStep)

      setProgress((prev) => {
        const steps = new Map(prev.steps)
        for (const s of rangeSteps) {
          const existing = steps.get(s)
          if (!existing || existing.state === "queued") {
            steps.set(s, { state: "running", progress: 0 })
          }
        }
        // Clear subSteps for the new run
        return { ...prev, steps, subSteps: new Map() }
      })

      // Queued item now started; backend has cleared downstream data.
      // Invalidate (not remove) so stale data stays visible during refetch
      // — avoids a flash where unrelated stages briefly appear incomplete.
      invalidateQueryKeys(
        queryClient,
        getStartInvalidationKeysForUiStep(label, data.fromStep)
      )
    })

    es.addEventListener("complete", () => {
      setProgress((prev) => {
        // Mark currently-running steps as done
        const steps = new Map(prev.steps)
        for (const [step, info] of steps) {
          if (info.state === "running") {
            steps.set(step, { state: "done", progress: 1 })
          }
        }

        const queued = hasQueuedSteps(steps)
        return {
          ...prev,
          isRunning: queued,
          isComplete: !queued,
          steps,
        }
      })

      invalidateBookQueries(queryClient, label)

      // Don't close the EventSource — the server keeps it open if more
      // queued runs are pending, and closes it when the queue drains.
    })

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        // Server closed the stream — all work is done
        setProgress((prev) => {
          if (!prev.isRunning) return prev
          return { ...prev, isRunning: false, isComplete: !prev.error }
        })
        return
      }
      const messageEvent = e as MessageEvent
      if (messageEvent.data) {
        try {
          const data = JSON.parse(messageEvent.data)
          setProgress((prev) => {
            const steps = new Map(prev.steps)
            // Only mark currently-running steps as error, not queued ones
            for (const [step, info] of steps) {
              if (info.state === "running") {
                steps.set(step, { state: "error", progress: 0 })
              }
            }
            const queued = hasQueuedSteps(steps)
            return {
              ...prev,
              isRunning: queued,
              error: queued ? null : (data.error ?? "Step run failed"),
              steps,
            }
          })
        } catch {
          setProgress((prev) => ({
            ...prev,
            isRunning: false,
            error: "Connection lost",
          }))
        }
        // Don't close if there are queued items — server will keep streaming.
        // Only close if we're done.
        setProgress((prev) => {
          if (!prev.isRunning) {
            es.close()
          }
          return prev
        })
      }
    })

    // Polling fallback
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getStepsStatus(label)
        const queueEmpty = !status.queue || status.queue.length === 0
        if (status.status === "completed" && queueEmpty) {
          setProgress((prev) => {
            if (!prev.isRunning) return prev
            const steps = new Map(prev.steps)
            for (const uiStep of prev.targetSteps) {
              const existing = steps.get(uiStep)
              if (existing && existing.state !== "error") {
                steps.set(uiStep, { state: "done", progress: 1 })
              }
            }
            return { ...prev, isRunning: false, isComplete: true, steps }
          })
          invalidateBookQueries(queryClient, label)
          es.close()
          clearInterval(pollInterval)
        } else if (status.status === "failed" && queueEmpty) {
          setProgress((prev) => {
            if (!prev.isRunning) return prev
            return { ...prev, isRunning: false, error: status.error ?? "Step run failed" }
          })
          es.close()
          clearInterval(pollInterval)
        }
      } catch {
        // Retry next interval
      }
    }, 10000)

    return () => {
      es.close()
      eventSourceRef.current = null
      clearInterval(pollInterval)
    }
  }, [label, enabled, queryClient])

  const startRun = useCallback(
    (fromStep: string, toStep: string) => {
      const newTargetSteps = getTargetStepsForRange(fromStep, toStep)

      setProgress((prev) => {
        const targetSteps = new Set(prev.targetSteps)
        const steps = new Map(prev.steps)
        const subSteps = new Map(prev.subSteps)

        // Clear downstream stages — the backend will wipe their data,
        // so stale "done"/"error" states from a previous run must go.
        // Uses the same DAG traversal as the backend (getStageClearOrder).
        const stagesToClear: Set<string> = new Set(getStageClearOrder(fromStep as StageName))
        for (const stage of stagesToClear) {
          if (newTargetSteps.has(stage)) continue // will be set to "queued" below
          const existing = steps.get(stage)
          if (existing && (existing.state === "done" || existing.state === "error")) {
            steps.delete(stage)
          }
        }

        // Clear sub-step progress for all stages being cleared
        for (const [stepName] of subSteps) {
          const stage = (STEP_TO_STAGE as Record<string, string>)[stepName]
          if (stage && stagesToClear.has(stage)) {
            subSteps.delete(stepName)
          }
        }

        for (const s of newTargetSteps) {
          targetSteps.add(s)
          // Only set to "queued" if not already running
          const existing = steps.get(s)
          if (!existing || existing.state === "idle" || existing.state === "done" || existing.state === "error") {
            steps.set(s, { state: "queued", progress: 0 })
          }
        }

        return {
          ...prev,
          isRunning: true,
          isComplete: false,
          error: null,
          targetSteps,
          steps,
          subSteps,
        }
      })
    },
    []
  )

  const reset = useCallback(() => {
    setProgress(INITIAL)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  return { progress, startRun, reset }
}

export interface QueueRunOptions {
  fromStep: string
  toStep: string
  apiKey: string
  azure?: { key: string; region: string }
}

// Context for sharing step run state across the book layout
export interface StepRunContextValue {
  progress: StepRunProgress
  startRun: (fromStep: string, toStep: string) => void
  reset: () => void
  setSseEnabled: (enabled: boolean) => void
  /** Queue a stage run. Serializes API calls so they arrive in click order. */
  queueRun: (options: QueueRunOptions) => void
}

export const StepRunContext = createContext<StepRunContextValue | null>(null)

export function useStepRun(): StepRunContextValue {
  const ctx = useContext(StepRunContext)
  if (!ctx) {
    throw new Error("useStepRun must be used within a StepRunContext provider")
  }
  return ctx
}
