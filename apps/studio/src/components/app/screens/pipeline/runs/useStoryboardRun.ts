import { useCallback } from "react"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"

export type StoryboardStartStage = "extract" | "sectioning" | "storyboard"

export interface StoryboardRun {
  run: () => void
  canRun: boolean
  hasApiKey: boolean
  hasSections: boolean
  isRunning: boolean
}

export function resolveStoryboardStartStage(
  extractCovered: boolean,
  sectioningCovered: boolean,
): StoryboardStartStage {
  if (!extractCovered) return "extract"
  if (!sectioningCovered) return "sectioning"
  return "storyboard"
}

export function useStoryboardRun(label: string): StoryboardRun {
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun, stageState } = useBookRun()
  const { data: pages, isLoading: pagesLoading } = usePages(label)

  const storyboardState = stageState("storyboard")
  const isRunning = storyboardState === "running" || storyboardState === "queued"

  const covered = (stage: "extract" | "sectioning") => {
    const state = stageState(stage)
    return state === "done" || state === "running" || state === "queued"
  }

  const hasExtractedPages = (pages?.length ?? 0) > 0
  const hasSections = (pages ?? []).some((page) => page.sectionCount > 0)
  const extractCovered = covered("extract") || hasExtractedPages
  const sectioningCovered = covered("sectioning") || hasSections
  const canRun = hasApiKey && hasSections && !isRunning && !pagesLoading

  const run = useCallback(() => {
    if (!canRun) return
    queueRun({
      fromStage: resolveStoryboardStartStage(extractCovered, sectioningCovered),
      toStage: "storyboard",
      apiKey,
    })
  }, [canRun, queueRun, extractCovered, sectioningCovered, apiKey])

  return { run, canRun, hasApiKey, hasSections, isRunning }
}
