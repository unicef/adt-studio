import { useMemo } from "react"
import type { StageName } from "@adt/types"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import type { DockSlug } from "./plugins"
import { STEP_PREREQ, isStepLocked, type StageEvidence } from "./stepPrereq"

export interface StepPrereq {
  /** Upstream stage this step waits on, or null when it never blocks. */
  upstream: StageName | null
  upstreamLabel: string
  /** False while the upstream has neither produced output nor been started. */
  isMet: boolean
  /** True when the upstream is met only because it is still running or queued. */
  upstreamInFlight: boolean
}

/** Resolves a step's blocking upstream against the same rules the dock uses. */
export function useStepPrereq(label: string, slug: DockSlug): StepPrereq {
  const { stageState } = useBookRun()
  const { data: pages } = usePages(label)

  return useMemo(() => {
    const list = pages ?? []
    const inFlight = (stage: string) => {
      const state = stageState(stage)
      return state === "running" || state === "queued"
    }
    const evidence: StageEvidence = {
      covered: (stage) => stageState(stage) === "done" || inFlight(stage),
      pageCount: list.length,
      hasSections: list.some((page) => page.sectionCount > 0),
      hasRendering: list.some((page) => page.hasRendering),
    }
    const upstream = STEP_PREREQ[slug]
    return {
      upstream,
      upstreamLabel: upstream ? getStageLabelI18n(upstream) : "",
      isMet: !isStepLocked(slug, evidence),
      upstreamInFlight: upstream != null && inFlight(upstream),
    }
  }, [pages, slug, stageState])
}
