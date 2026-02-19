import { useState, useEffect, useCallback, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import type { PipelineProgress, StepProgress, LlmLogSummary, StepName } from "./use-pipeline"

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
 * Hook to subscribe to real-time master progress via SSE.
 * Same event format as pipeline/proof SSE — reuses PipelineProgress state shape.
 */
export function useMasterSSE(label: string, enabled: boolean) {
  const [progress, setProgress] = useState<PipelineProgress>(INITIAL_PROGRESS)
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

    const url = `/api/books/${label}/master/status`
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
          next.currentStep = data.step as StepName
        } else if (data.type === "step-progress") {
          stepProgress.set(data.step as StepName, {
            step: data.step,
            page: data.page,
            totalPages: data.totalPages,
            message: data.message,
          } as StepProgress)
          next.currentStep = data.step as StepName
        } else if (data.type === "step-complete") {
          completedSteps.add(data.step as StepName)
          stepProgress.delete(data.step as StepName)
        } else if (data.type === "step-skip") {
          skippedSteps.add(data.step as StepName)
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
      queryClient.invalidateQueries({ queryKey: ["master-status", label] })
      queryClient.invalidateQueries({ queryKey: ["books", label] })
      queryClient.invalidateQueries({ queryKey: ["books"] })
      queryClient.invalidateQueries({ queryKey: ["debug"] })
      es.close()
    })

    es.addEventListener("error", (e) => {
      if (es.readyState === EventSource.CLOSED) {
        return
      }
      const messageEvent = e as MessageEvent
      if (messageEvent.data) {
        try {
          const data = JSON.parse(messageEvent.data)
          setProgress((prev) => ({
            ...prev,
            isRunning: false,
            error: data.error ?? "Master failed",
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
    })

    const pollInterval = setInterval(async () => {
      try {
        const status = await api.getMasterStatus(label)
        if (status.status === "completed") {
          setProgress((prev) => {
            if (!prev.isRunning) return prev
            return {
              ...prev,
              isRunning: false,
              isComplete: true,
              currentStep: null,
            }
          })
          queryClient.invalidateQueries({ queryKey: ["master-status", label] })
          queryClient.invalidateQueries({ queryKey: ["books", label] })
          queryClient.invalidateQueries({ queryKey: ["books"] })
          queryClient.invalidateQueries({ queryKey: ["debug"] })
          es.close()
          clearInterval(pollInterval)
        } else if (status.status === "failed") {
          setProgress((prev) => {
            if (!prev.isRunning) return prev
            return {
              ...prev,
              isRunning: false,
              error: status.error ?? "Master failed",
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  return { progress, reset }
}

/**
 * Hook to start a master run.
 */
export function useRunMaster() {
  const queryClient = useQueryClient()
  const { azureKey, azureRegion } = useApiKey()
  return useMutation({
    mutationFn: ({ label, apiKey }: { label: string; apiKey: string }) =>
      api.runMaster(label, apiKey, { key: azureKey, region: azureRegion }),
    onSuccess: (_data, { label }) => {
      queryClient.invalidateQueries({ queryKey: ["master-status", label] })
    },
  })
}

/**
 * Hook to poll master status (non-SSE fallback).
 */
export function useMasterStatus(label: string) {
  return useQuery({
    queryKey: ["master-status", label],
    queryFn: () => api.getMasterStatus(label),
    enabled: !!label,
    refetchInterval: false,
  })
}
