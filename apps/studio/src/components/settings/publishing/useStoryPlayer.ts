import { useCallback, useEffect, useRef, useState } from "react"
import {
  ACT_START_MS,
  STORY_ACTS,
  STORY_TOTAL_DURATION_MS,
  actIndexAtElapsed,
} from "./story-acts"

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false
    /* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query */
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    /* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query */
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setPrefers(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return prefers
}

const REDUCED_MOTION_DEFAULT_INDEX = STORY_ACTS.findIndex((act) => act.id === "comment")

export interface StoryPlayerState {
  activeIndex: number
  activeAct: (typeof STORY_ACTS)[number]
  isSeized: boolean
  isEnded: boolean
  prefersReducedMotion: boolean
  seize: () => void
  release: () => void
  jumpToAct: (index: number) => void
}

export function useStoryPlayer(): StoryPlayerState {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isSeized, setIsSeized] = useState(false)
  const [reducedMotionIndex, setReducedMotionIndex] = useState(REDUCED_MOTION_DEFAULT_INDEX)
  const rafRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)

  /** The story plays once and settles: the clock clamps at the total duration
   *  instead of wrapping, leaving the final scene at rest and interactive. */
  const isEnded = !prefersReducedMotion && elapsedMs >= STORY_TOTAL_DURATION_MS

  const isPlaying = !prefersReducedMotion && !isSeized && !isEnded

  useEffect(() => {
    if (!isPlaying) {
      lastTimestampRef.current = null
      return
    }

    function tick(timestamp: number) {
      if (lastTimestampRef.current !== null) {
        const delta = timestamp - lastTimestampRef.current
        setElapsedMs((previous) => Math.min(previous + delta, STORY_TOTAL_DURATION_MS))
      }
      lastTimestampRef.current = timestamp
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTimestampRef.current = null
    }
  }, [isPlaying])

  const seize = useCallback(() => setIsSeized(true), [])
  const release = useCallback(() => setIsSeized(false), [])

  const jumpToAct = useCallback((index: number) => {
    if (prefersReducedMotion) {
      setReducedMotionIndex(index)
      return
    }
    // Land just inside the act's start so it replays its enter animation in
    // full; playback resumes from there and settles again at the end.
    setElapsedMs(ACT_START_MS[index] + 16)
  }, [prefersReducedMotion])

  const clampedElapsed = Math.min(elapsedMs, STORY_TOTAL_DURATION_MS - 1)
  const activeIndex = prefersReducedMotion ? reducedMotionIndex : actIndexAtElapsed(clampedElapsed)

  return {
    activeIndex,
    activeAct: STORY_ACTS[activeIndex],
    isSeized,
    isEnded,
    prefersReducedMotion,
    seize,
    release,
    jumpToAct,
  }
}
