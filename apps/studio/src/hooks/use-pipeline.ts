import { useState, useEffect, useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"

export type StepName =
  | "extract"
  | "metadata"
  | "text-classification"
  | "book-summary"
  | "translation"
  | "image-classification"
  | "page-sectioning"
  | "web-rendering"
  | "image-captioning"
  | "glossary"
  | "quiz-generation"
  | "text-catalog"
  | "catalog-translation"
  | "tts"
  | "package-web"

export interface StepProgress {
  step: StepName
  page?: number
  totalPages?: number
  message?: string
}

export interface LlmLogSummary {
  step: StepName
  itemId: string
  promptName: string
  modelId: string
  cacheHit: boolean
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  validationErrors?: string[]
  receivedAt: number
}

export interface PipelineProgress {
  isRunning: boolean
  isComplete: boolean
  error: string | null
  currentStep: StepName | null
  completedSteps: Set<StepName>
  skippedSteps: Set<StepName>
  stepProgress: Map<StepName, StepProgress>
  liveLlmLogs: LlmLogSummary[]
}

const MAX_LIVE_LOGS = 500

const INITIAL_PROGRESS: PipelineProgress = {
  isRunning: false,
  isComplete: false,
  error: null,
  currentStep: null,
  completedSteps: new Set(),
  skippedSteps: new Set(),
  stepProgress: new Map(),
  liveLlmLogs: [],
}

/**
 * Module-level cache of pipeline progress per book label.
 * Survives component unmount/navigation so progress isn't lost.
 */
const progressCache = new Map<string, PipelineProgress>()

/**
 * Hook to subscribe to real-time pipeline progress via SSE.
 * Connects to the SSE endpoint when `enabled` is true.
 * Includes a polling fallback to catch completion if SSE misses it.
 */
export function usePipelineSSE(label: string, enabled: boolean) {
  const [progress, _setProgress] = useState<PipelineProgress>(
    () => progressCache.get(label) ?? INITIAL_PROGRESS
  )

  // Wrap setProgress to also persist to module-level cache
  const setProgress: typeof _setProgress = useCallback((action) => {
    _setProgress((prev) => {
      const next = typeof action === "function" ? action(prev) : action
      progressCache.set(label, next)
      return next
    })
  }, [label])
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !label) {
      return
    }

    // Don't reset progress on reconnect — preserve previously received step data.
    // Fresh runs call reset() before enabling SSE, which handles the clean-slate case.
    setProgress((prev) => ({
      ...prev,
      isRunning: true,
      isComplete: false,
      error: null,
    }))

    const url = `/api/books/${label}/pipeline/status`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data)
      setProgress((prev) => {
        const next = { ...prev }
        const stepProgress = new Map(prev.stepProgress)
        const completedSteps = new Set(prev.completedSteps)
        const skippedSteps = new Set(prev.skippedSteps)

        if (data.type === "step-start") {
          next.currentStep = data.step
        } else if (data.type === "step-skip") {
          skippedSteps.add(data.step)
        } else if (data.type === "step-progress") {
          stepProgress.set(data.step, {
            step: data.step,
            page: data.page,
            totalPages: data.totalPages,
            message: data.message,
          })
          next.currentStep = data.step
        } else if (data.type === "step-complete") {
          completedSteps.add(data.step)
          stepProgress.delete(data.step)
        } else if (data.type === "step-error") {
          next.error = `${data.step}: ${data.error}`
        } else if (data.type === "llm-log") {
          const entry: LlmLogSummary = {
            step: data.step,
            itemId: data.itemId,
            promptName: data.promptName,
            modelId: data.modelId,
            cacheHit: data.cacheHit,
            durationMs: data.durationMs,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            validationErrors: data.validationErrors,
            receivedAt: Date.now(),
          }
          const logs = [...prev.liveLlmLogs, entry]
          next.liveLlmLogs = logs.length > MAX_LIVE_LOGS ? logs.slice(-MAX_LIVE_LOGS) : logs
        }

        next.stepProgress = stepProgress
        next.completedSteps = completedSteps
        next.skippedSteps = skippedSteps
        return next
      })
    })

    es.addEventListener("complete", () => {
      setProgress((prev) => ({
        ...prev,
        isRunning: false,
        isComplete: true,
        currentStep: null,
      }))
      queryClient.invalidateQueries({ queryKey: ["pipeline-status", label] })
      queryClient.invalidateQueries({ queryKey: ["books", label] })
      queryClient.invalidateQueries({ queryKey: ["books"] })
      queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
      queryClient.invalidateQueries({ queryKey: ["debug"] })
      es.close()
    })

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        return
      }
      // Only close on actual server error events with data.
      // For connection drops (no data), let EventSource auto-reconnect.
      const messageEvent = e as MessageEvent
      if (messageEvent.data) {
        try {
          const data = JSON.parse(messageEvent.data)
          setProgress((prev) => ({
            ...prev,
            isRunning: false,
            error: data.error ?? "Pipeline failed",
          }))
        } catch {
          setProgress((prev) => ({
            ...prev,
            isRunning: false,
            error: "Connection lost",
          }))
        }
        es.close()
      }
      // No data = connection drop, EventSource will auto-reconnect
    })

    // Polling fallback: if SSE misses the complete event (e.g., during
    // reconnection timing gap), poll the JSON status endpoint to catch it.
    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getPipelineStatus(label)
        if (status.status === "completed") {
          setProgress((prev) => {
            if (!prev.isRunning) return prev // already handled via SSE
            return {
              ...prev,
              isRunning: false,
              isComplete: true,
              currentStep: null,
            }
          })
          queryClient.invalidateQueries({ queryKey: ["pipeline-status", label] })
          queryClient.invalidateQueries({ queryKey: ["books", label] })
          queryClient.invalidateQueries({ queryKey: ["books"] })
          queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
          es.close()
          clearInterval(pollInterval)
        } else if (status.status === "failed") {
          setProgress((prev) => {
            if (!prev.isRunning) return prev
            return {
              ...prev,
              isRunning: false,
              error: status.error ?? "Pipeline failed",
            }
          })
          es.close()
          clearInterval(pollInterval)
        }
      } catch {
        // Polling failed, will retry next interval
      }
    }, 10000)

    return () => {
      es.close()
      eventSourceRef.current = null
      clearInterval(pollInterval)
    }
  }, [label, enabled, queryClient])

  const reset = useCallback(() => {
    setProgress(INITIAL_PROGRESS)
    progressCache.delete(label)
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [label, setProgress])

  return { progress, reset }
}

/**
 * Hook to start a pipeline run.
 */
export function useRunPipeline() {
  const queryClient = useQueryClient()
  const { azureKey, azureRegion } = useApiKey()
  return useMutation({
    mutationFn: ({
      label,
      apiKey,
      options,
    }: {
      label: string
      apiKey: string
      options?: { startPage?: number; endPage?: number }
    }) => api.runPipeline(label, apiKey, options, { key: azureKey, region: azureRegion }),
    onSuccess: (_data, { label }) => {
      queryClient.invalidateQueries({
        queryKey: ["pipeline-status", label],
      })
    },
  })
}

/**
 * Hook to poll pipeline status (non-SSE fallback).
 */
export function usePipelineStatus(label: string) {
  return useQuery({
    queryKey: ["pipeline-status", label],
    queryFn: () => api.getPipelineStatus(label),
    enabled: !!label,
    refetchInterval: false,
  })
}
