import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReviewStep } from "../ranking"
import { typing } from "../step/useReviewSession"
import type { ReviewSession } from "../step/useReviewSession"
import type { FilteredImagesApi } from "../useFilteredImages"

interface Entry {
  step: ReviewStep
  index: number
}

export function usePageReview({ session, data, pageId, pageNumber, keys }: { session: ReviewSession; data: FilteredImagesApi; pageId: string | null; pageNumber: number | null; keys: boolean }) {
  const steps = session.steps
  const onPage = useMemo<Entry[]>(
    () => (pageId ? steps.flatMap((step, index) => (step.items.some((item) => item.pageId === pageId) ? [{ step, index }] : [])) : []),
    [steps, pageId],
  )
  const [doneOn, setDoneOn] = useState<string | null>(null)
  const isOpen = useCallback((entry: Entry) => entry.step.items.some((item) => !item.restored && !session.decisionOf(item.key)), [session])
  const running = session.active && !session.finished && pageId !== null
  const here = running && doneOn !== pageId ? onPage.findIndex((entry) => entry.index === session.index) : -1
  const current = here >= 0 ? onPage[here] : null

  useEffect(() => {
    if (doneOn && doneOn !== pageId) setDoneOn(null)
  }, [doneOn, pageId])

  useEffect(() => {
    if (!running || doneOn === pageId || here >= 0 || onPage.length === 0) return
    const first = onPage.find(isOpen) ?? onPage[0]
    session.goTo(first.index, pageId ?? undefined)
  }, [running, doneOn, pageId, here, onPage, isOpen, session])

  const nextPage = useMemo(() => {
    if (!pageId) return null
    const targets = steps.flatMap((step, index) => {
      const open = step.items.filter((item) => item.pageId !== pageId && !item.restored && !session.decisionOf(item.key))
      return open.map((item) => ({ index, pageId: item.pageId, pageNumber: item.pageNumber }))
    })
    if (targets.length === 0) return null
    const sorted = targets.sort((a, b) => a.pageNumber - b.pageNumber || a.index - b.index)
    return sorted.find((target) => pageNumber !== null && target.pageNumber > pageNumber) ?? sorted[0]
  }, [steps, pageId, pageNumber, session])

  const advance = useCallback(() => {
    const after = here >= 0 ? onPage.slice(here + 1).find(isOpen) : undefined
    if (after) session.goTo(after.index, pageId ?? undefined)
    else setDoneOn(pageId)
  }, [here, onPage, isOpen, session, pageId])

  const keep = useCallback(() => {
    if (!current) return
    for (const item of current.step.items) if (!item.restored) session.record(item.key, "kept")
    advance()
  }, [current, session, advance])

  const bringBack = useCallback(() => {
    if (!current || data.blocked) return
    void data.bringBack(current.step.items)
    for (const item of current.step.items) session.record(item.key, "back")
    advance()
  }, [current, data, session, advance])

  const prev = useCallback(() => {
    if (here > 0) session.goTo(onPage[here - 1].index, pageId ?? undefined)
  }, [here, onPage, session, pageId])

  const next = useCallback(() => {
    if (here >= 0 && here < onPage.length - 1) session.goTo(onPage[here + 1].index, pageId ?? undefined)
    else setDoneOn(pageId)
  }, [here, onPage, session, pageId])

  const goNextPage = useCallback(() => {
    if (!nextPage) {
      session.close()
      return
    }
    setDoneOn(null)
    session.goTo(nextPage.index, nextPage.pageId)
  }, [nextPage, session])

  const start = useCallback(() => {
    setDoneOn(null)
    const first = onPage.find(isOpen) ?? onPage[0]
    if (first) session.goTo(first.index, pageId ?? undefined)
    else session.start()
  }, [onPage, isOpen, session, pageId])

  const reopen = useCallback(() => {
    setDoneOn(null)
    if (onPage[0]) session.goTo(onPage[0].index, pageId ?? undefined)
  }, [onPage, session, pageId])

  useEffect(() => {
    if (!keys || !current) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === "ArrowLeft") prev()
      else next()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [keys, current, prev, next])

  const openCount = onPage.filter(isOpen).length

  return {
    running,
    current,
    done: running && doneOn === pageId,
    empty: running && onPage.length === 0,
    position: here + 1,
    total: onPage.length,
    open: openCount,
    hasPrev: here > 0,
    nextPage,
    keep,
    bringBack,
    undo: session.undo,
    prev,
    next,
    goNextPage,
    start,
    reopen,
    close: session.close,
  }
}

export type PageReview = ReturnType<typeof usePageReview>
