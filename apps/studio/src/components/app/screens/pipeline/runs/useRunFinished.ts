import { useCallback, useEffect, useState } from "react"
import type { RunStageActivity } from "./useRunActivity"

const FRESH_FINISH_MS = 15_000
const activeStages = new Set<string>()
const finishedAt = new Map<string, number>()

function isFreshFinish(slug: string | undefined): boolean {
  if (!slug) return false
  const at = finishedAt.get(slug)
  return at !== undefined && Date.now() - at < FRESH_FINISH_MS
}

export function useRunFinished(activity: RunStageActivity | null): [boolean, () => void] {
  const slug = activity?.slug
  const [finished, setFinished] = useState(() => isFreshFinish(slug))
  const isActive = activity?.isActive ?? false
  const state = activity?.state

  useEffect(() => {
    if (!slug) return
    if (isActive) {
      activeStages.add(slug)
      finishedAt.delete(slug)
      setFinished(false)
      return
    }
    if (activeStages.has(slug)) {
      activeStages.delete(slug)
      if (state === "done") finishedAt.set(slug, Date.now())
    }
    if (isFreshFinish(slug)) setFinished(true)
  }, [slug, isActive, state])

  const dismiss = useCallback(() => {
    if (slug) finishedAt.delete(slug)
    setFinished(false)
  }, [slug])
  return [finished, dismiss]
}
