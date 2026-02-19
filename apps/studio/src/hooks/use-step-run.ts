import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { getTargetStepsForRange, isFinalPipelineStepForUiStep } from "./step-run-range"
import { STEP_TO_STAGE } from "@adt/types"
import {
  getInvalidationKeysForUiStep,
  getMetadataInvalidationKeys,
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

      const isFinalCompletion =
        data.type === "step-complete" &&
        isFinalPipelineStepForUiStep(uiStep, pipelineStep)
      const isMetadataCompletion =
        data.type === "step-complete" && pipelineStep === "metadata"

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
        } else if (data.type === "step-complete") {
          if (isFinalCompletion) {
            steps.set(uiStep, { state: "done", progress: 1 })
          }
          subSteps.set(pipelineStep, { state: "done" })
        } else if (data.type === "step-skip") {
          if (isFinalPipelineStepForUiStep(uiStep, pipelineStep)) {
            steps.set(uiStep, { state: "done", progress: 1 })
          }
          subSteps.set(pipelineStep, { state: "done" })
        } else if (data.type === "step-error") {
          steps.set(uiStep, { state: "error", progress: 0 })
          subSteps.set(pipelineStep, { state: "error" })
        }

        return { ...prev, steps, subSteps }
      })

      if (isFinalCompletion) {
        invalidateQueryKeys(queryClient, getInvalidationKeysForUiStep(label, uiStep))
      }
      if (isMetadataCompletion) {
        invalidateQueryKeys(queryClient, getMetadataInvalidationKeys(label))
      }
    })

    es.addEventListener("complete", () => {
      setProgress((prev) => {
        // Mark all target steps as done
        const steps = new Map(prev.steps)
        for (const uiStep of prev.targetSteps) {
          const existing = steps.get(uiStep)
          if (existing && existing.state !== "error") {
            steps.set(uiStep, { state: "done", progress: 1 })
          }
        }
        return {
          ...prev,
          isRunning: false,
          isComplete: true,
          steps,
        }
      })
      queryClient.invalidateQueries({ queryKey: ["books", label] })
      queryClient.invalidateQueries({ queryKey: ["books"] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
      queryClient.invalidateQueries({ queryKey: ["debug"] })
      es.close()
    })

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) return
      const messageEvent = e as MessageEvent
      if (messageEvent.data) {
        try {
          const data = JSON.parse(messageEvent.data)
          setProgress((prev) => {
            const steps = new Map(prev.steps)
            for (const uiStep of prev.targetSteps) {
              const existing = steps.get(uiStep)
              if (existing && existing.state !== "done") {
                steps.set(uiStep, { state: "error", progress: 0 })
              }
            }
            return {
              ...prev,
              isRunning: false,
              error: data.error ?? "Step run failed",
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
        es.close()
      }
    })

    // Polling fallback
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getStepsStatus(label)
        if (status.status === "completed") {
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
          queryClient.invalidateQueries({ queryKey: ["books", label] })
          queryClient.invalidateQueries({ queryKey: ["books"] })
          queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
          queryClient.invalidateQueries({ queryKey: ["books", label, "step-status"] })
          es.close()
          clearInterval(pollInterval)
        } else if (status.status === "failed") {
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
      // Set target steps and mark them as queued
      const targetSteps = getTargetStepsForRange(fromStep, toStep)

      const steps = new Map<string, UIStepProgress>()
      for (const s of targetSteps) {
        steps.set(s, { state: "queued", progress: 0 })
      }

      setProgress({
        isRunning: true,
        isComplete: false,
        error: null,
        targetSteps,
        steps,
        subSteps: new Map(),
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

// Context for sharing step run state across v2 layout
export interface StepRunContextValue {
  progress: StepRunProgress
  startRun: (fromStep: string, toStep: string) => void
  reset: () => void
  setSseEnabled: (enabled: boolean) => void
}

export const StepRunContext = createContext<StepRunContextValue | null>(null)

export function useStepRun(): StepRunContextValue {
  const ctx = useContext(StepRunContext)
  if (!ctx) {
    throw new Error("useStepRun must be used within a StepRunContext provider")
  }
  return ctx
}
