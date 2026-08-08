import { useCallback, useMemo } from "react"
import { PIPELINE, STAGE_BY_NAME, type StageName } from "@adt/types"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"

export interface StageRun {
  run: () => void
  canRun: boolean
  hasApiKey: boolean
  isRunning: boolean
  /** True when this slug is a pipeline stage at all — sign language is not. */
  isRunnable: boolean
  /** Upstream stages with no output yet. The run starts from the earliest one. */
  missingUpstream: StageName[]
}

const STAGE_POSITION = new Map<StageName, number>(PIPELINE.map((def, i) => [def.name, i]))

function isCovered(state: string): boolean {
  return state === "done" || state === "running" || state === "queued"
}

/**
 * Queues a run for any pipeline stage from its step view.
 *
 * When an upstream stage has no output yet the run starts from the earliest
 * missing ancestor instead of the stage itself, so pressing "Suggest terms"
 * on a book with no storyboard still produces terms rather than failing.
 */
export function useStageRun(label: string, slug: string): StageRun {
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun, stageState, isRunning: runInFlight } = useBookRun()
  const { data: pages, isLoading: pagesLoading } = usePages(label)

  const def = STAGE_BY_NAME[slug as StageName] as (typeof PIPELINE)[number] | undefined
  const state = def ? stageState(def.name) : "idle"
  const isRunning = runInFlight || state === "running" || state === "queued"

  const hasPages = (pages?.length ?? 0) > 0
  const hasSections = (pages ?? []).some((page) => page.sectionCount > 0)
  const hasRendering = (pages ?? []).some((page) => page.hasRendering)

  const covered = useCallback(
    (name: StageName): boolean => {
      if (isCovered(stageState(name))) return true
      // Older books carry output without the stage flag — trust the artifacts.
      if (name === "extract") return hasPages
      if (name === "sectioning") return hasSections
      if (name === "storyboard") return hasRendering
      return false
    },
    [stageState, hasPages, hasSections, hasRendering],
  )

  const missingUpstream = useMemo(() => {
    if (!def) return []
    const missing = new Set<StageName>()
    const visit = (name: StageName) => {
      for (const dep of STAGE_BY_NAME[name]?.dependsOn ?? []) {
        if (covered(dep) || missing.has(dep)) continue
        missing.add(dep)
        visit(dep)
      }
    }
    visit(def.name)
    return [...missing].sort(
      (a, b) => (STAGE_POSITION.get(a) ?? 0) - (STAGE_POSITION.get(b) ?? 0),
    )
  }, [def, covered])

  const isRunnable = def != null
  const canRun = isRunnable && hasApiKey && !isRunning && !pagesLoading

  const run = useCallback(() => {
    if (!canRun || !def) return
    queueRun({
      fromStage: missingUpstream[0] ?? def.name,
      toStage: def.name,
      apiKey,
    })
  }, [canRun, def, missingUpstream, queueRun, apiKey])

  return { run, canRun, hasApiKey, isRunning, isRunnable, missingUpstream }
}
