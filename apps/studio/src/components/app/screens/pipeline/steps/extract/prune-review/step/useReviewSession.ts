import { useCallback, useEffect, useMemo, useRef } from "react"
import { overlayOpen } from "../../../shared/usePageDetailKeys"
import { useReviewProgress, type ReviewDecision } from "../leftOutStore"
import { stepIndexOf, type ReviewStep } from "../ranking"
import type { FilteredImagesApi } from "../useFilteredImages"

export function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))
}

export function useReviewSession({
  label,
  steps,
  pageId,
  goToPage,
  data,
  keys,
}: {
  label: string
  steps: readonly ReviewStep[]
  pageId: string | null
  goToPage: (pageId: string) => void
  data: FilteredImagesApi
  keys: boolean
}) {
  const [progress, update] = useReviewProgress(label)
  const found = useMemo(() => stepIndexOf(steps, progress.cursor), [steps, progress.cursor])
  const index = found >= 0 ? found : 0
  const current = steps[index] ?? null

  const goTo = useCallback(
    (target: number, onPage?: string) => {
      const step = steps[Math.max(0, Math.min(steps.length - 1, target))]
      if (!step) return
      update((previous) => ({ ...previous, active: true, finished: false, cursor: step.key }))
      const pages = step.items.map((item) => item.pageId)
      const destination = onPage && pages.includes(onPage) ? onPage : pageId && pages.includes(pageId) ? pageId : step.lead.pageId
      if (destination !== pageId) goToPage(destination)
    },
    [steps, pageId, goToPage, update],
  )

  const start = useCallback(
    (fromKey?: string) => {
      const at = stepIndexOf(steps, fromKey ?? null)
      const firstOpen = steps.findIndex((step) => step.items.some((item) => !progress.decisions[item.key] && !item.restored))
      const resume = stepIndexOf(steps, progress.cursor)
      const target = at >= 0 ? at : resume >= 0 && !progress.finished ? resume : firstOpen >= 0 ? firstOpen : 0
      const page = at >= 0 && fromKey ? steps[at].items.find((item) => item.key === fromKey)?.pageId : undefined
      goTo(target, page)
    },
    [steps, progress.cursor, progress.decisions, progress.finished, goTo],
  )

  const record = useCallback((key: string, decision: ReviewDecision) => update((previous) => ({ ...previous, decisions: { ...previous.decisions, [key]: decision } })), [update])
  const forget = useCallback(
    (keysToForget: readonly string[]) =>
      update((previous) => {
        const decisions = { ...previous.decisions }
        for (const key of keysToForget) delete decisions[key]
        return { ...previous, decisions }
      }),
    [update],
  )
  const recordAll = useCallback(
    (keysToRecord: readonly string[], decision: ReviewDecision) =>
      update((previous) => {
        const decisions = { ...previous.decisions }
        for (const key of keysToRecord) decisions[key] = decision
        return { ...previous, decisions }
      }),
    [update],
  )

  const finish = useCallback(() => update((previous) => ({ ...previous, finished: true })), [update])

  const advance = useCallback(() => {
    if (index >= steps.length - 1) finish()
    else goTo(index + 1)
  }, [index, steps.length, goTo, finish])

  const keep = useCallback(() => {
    if (!current) return
    recordAll(
      current.items.filter((item) => !item.restored).map((item) => item.key),
      "kept",
    )
    advance()
  }, [current, recordAll, advance])

  const bringBack = useCallback(() => {
    if (!current || data.blocked) return
    void data.bringBack(current.items)
    recordAll(
      current.items.map((item) => item.key),
      "back",
    )
    advance()
  }, [current, data, recordAll, advance])

  const undo = useCallback(() => {
    if (!current) return
    void data.undo(current.items)
    recordAll(
      current.items.map((item) => item.key),
      "kept",
    )
  }, [current, data, recordAll])

  const close = useCallback(() => update((previous) => ({ ...previous, active: false })), [update])
  const restart = useCallback(() => {
    update((previous) => ({ ...previous, decisions: {}, finished: false }))
    goTo(0)
  }, [update, goTo])

  const lastPage = useRef(pageId)
  useEffect(() => {
    if (lastPage.current === pageId) return
    lastPage.current = pageId
    if (!progress.active || progress.finished || !pageId || current?.items.some((item) => item.pageId === pageId)) return
    const here = steps.find((step) => step.items.some((item) => item.pageId === pageId))
    if (here) update((previous) => ({ ...previous, cursor: here.key }))
  }, [pageId, progress.active, progress.finished, current, steps, update])

  const live = keys && progress.active && !progress.finished && steps.length > 0
  useEffect(() => {
    if (!live) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || overlayOpen()) return
      event.preventDefault()
      if (event.key === "ArrowLeft") goTo(index - 1)
      else if (index >= steps.length - 1) finish()
      else goTo(index + 1)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [live, index, steps.length, goTo, finish])

  const counts = useMemo(() => {
    let back = 0
    let kept = 0
    let images = 0
    for (const step of steps) {
      for (const item of step.items) {
        images++
        const decision = item.restored ? "back" : progress.decisions[item.key]
        if (decision === "back") back++
        else if (decision === "kept") kept++
      }
    }
    return { back, kept, open: images - back - kept, images }
  }, [steps, progress.decisions])

  const running = progress.active && !progress.finished && current !== null
  const focus = running && pageId ? (current.items.find((item) => item.pageId === pageId) ?? null) : null

  return {
    active: progress.active,
    finished: progress.finished,
    started: progress.cursor !== null,
    index,
    total: steps.length,
    images: counts.images,
    steps,
    current,
    focus,
    counts,
    decisionOf: (key: string) => progress.decisions[key],
    start,
    goTo,
    prev: () => goTo(index - 1),
    next: () => (index >= steps.length - 1 ? finish() : goTo(index + 1)),
    keep,
    bringBack,
    undo,
    record,
    forget,
    close,
    restart,
  }
}

export type ReviewSession = ReturnType<typeof useReviewSession>
