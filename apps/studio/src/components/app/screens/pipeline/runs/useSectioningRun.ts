import { useCallback } from "react"
import { resolveSectioningStartStage } from "@/components/pipeline/stages/sectioning/SectioningLandingPage.helpers"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import { useSplitStatus } from "@/hooks/use-parts"

export interface SectioningRun {
  run: () => void
  canRun: boolean
  hasProvider: boolean
  isRunning: boolean
}

export function useSectioningRun(label: string): SectioningRun {
  const { apiKey } = useApiKey()
  const hasProvider = useBookStructuredTextAvailability(label)
  const { queueRun, stageState } = useBookRun()
  const { data: pages, isLoading: pagesLoading } = usePages(label)
  const { data: splitStatus, isLoading: splitStatusLoading } = useSplitStatus(label)

  const sectioningState = stageState("sectioning")
  const extractState = stageState("extract")
  const isRunning = sectioningState === "running" || sectioningState === "queued"
  const extractCovered =
    extractState === "done" || extractState === "running" || extractState === "queued"
  const hasExtractedPages = (pages?.length ?? 0) > 0
  const hasAssembledPages = hasExtractedPages && splitStatus?.hasMergeActivity === true
  const resolvingStoredState =
    !extractCovered && (pagesLoading || (hasExtractedPages && splitStatusLoading))
  const canRun = hasProvider && !isRunning && !resolvingStoredState

  const run = useCallback(() => {
    if (!canRun) return
    queueRun({
      fromStage: resolveSectioningStartStage(extractCovered, hasAssembledPages),
      toStage: "sectioning",
      apiKey,
    })
  }, [canRun, queueRun, extractCovered, hasAssembledPages, apiKey])

  return { run, canRun, hasProvider, isRunning }
}
