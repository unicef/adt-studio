import { useCallback } from "react"
import { PIPELINE, STAGE_BY_NAME, type StageName } from "@adt/types"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"

export interface StageRun {
  run: () => void
  canRun: boolean
  hasApiKey: boolean
  /** True when *this* stage is already running or queued. */
  isRunning: boolean
  /** True when this slug is a pipeline stage at all — sign language is not. */
  isRunnable: boolean
}

/**
 * Queues a run for one pipeline stage from its step view.
 *
 * The job is scoped to this one stage because the backend runs a whole
 * `fromStage → toStage` range as a single cancellable job: a wider range would
 * make cancelling Language also cancel Quizzes, Captions, Glossary, TOC and
 * Easy Read. Missing upstream output is therefore gated by `stepPrereq.ts`
 * rather than pulled into the run.
 *
 * A run in flight elsewhere in the book is not a gate — the server queues jobs
 * per book and starts the next when the active one lands, so stages pressed in
 * a row all get scheduled.
 */
export function useStageRun(label: string, slug: string): StageRun {
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun, stageState } = useBookRun()
  const { isLoading: pagesLoading } = usePages(label)

  const def = STAGE_BY_NAME[slug as StageName] as (typeof PIPELINE)[number] | undefined
  const state = def ? stageState(def.name) : "idle"
  const isRunning = state === "running" || state === "queued"

  const isRunnable = def != null
  const canRun = isRunnable && hasApiKey && !isRunning && !pagesLoading

  const run = useCallback(() => {
    if (!canRun || !def) return
    queueRun({ fromStage: def.name, toStage: def.name, apiKey })
  }, [canRun, def, queueRun, apiKey])

  return { run, canRun, hasApiKey, isRunning, isRunnable }
}
