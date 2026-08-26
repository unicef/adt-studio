import { useCallback } from "react"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"

export interface ExtractRun {
  run: () => void
  canRun: boolean
  hasApiKey: boolean
  isRunning: boolean
  isInterrupted: boolean
  hasError: boolean
}

export function useExtractRun(label: string): ExtractRun {
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun, stageState } = useBookRun()
  const { data: pages } = usePages(label)

  const state = stageState("extract")
  const isRunning = state === "running" || state === "queued"
  const hasPages = (pages?.length ?? 0) > 0
  const isInterrupted = hasPages && state === "idle"
  const hasError = state === "error"
  const canRun = hasApiKey && !isRunning

  const run = useCallback(() => {
    if (!canRun) return
    queueRun({ fromStage: "extract", toStage: "extract", apiKey })
  }, [canRun, queueRun, apiKey])

  return { run, canRun, hasApiKey, isRunning, isInterrupted, hasError }
}
