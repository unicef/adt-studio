import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DashboardData, DashThread } from "./dashboard-data"
import type { CommentLocation } from "./FeedbackPage"
import { feedbackStats, visibleThreads, type FeedbackSort, type FeedbackView } from "./feedback-view"
import { useHeldResolve } from "./use-held-resolve"

/** The Feedback tab's state: which comments are shown, which one is open, and the
 *  resolve-with-undo. */
export function useFeedbackWorkspace(data: DashboardData) {
  const [view, setView] = useState<FeedbackView>("waiting")
  const [sort, setSort] = useState<FeedbackSort>("newest")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { hold, undo, held, failed } = useHeldResolve(data.resolve)
  /** Replies being written, per thread, so switching away and back — or the thread moving out
   *  of the list when its resolve lands — never throws a draft away. */
  const drafts = useRef(new Map<string, string>())
  /** Where each comment points, as the page reports it once it has resolved the pin. */
  const [locations, setLocations] = useState<ReadonlyMap<string, CommentLocation>>(new Map())
  const locate = useCallback((id: string, location: CommentLocation) => {
    setLocations((current) => {
      const previous = current.get(id)
      if (previous && JSON.stringify(previous) === JSON.stringify(location)) return current
      return new Map(current).set(id, location)
    })
  }, [])

  const stats = useMemo(() => feedbackStats(data.allThreads), [data.allThreads])
  /** Waiting, less the ones resolved on screen that the service hasn't caught up with. */
  const waitingNow = stats.waiting - data.allThreads.filter((thread) => !thread.resolved && held.has(thread.id)).length
  const list = useMemo(() => {
    const shown = visibleThreads(data.allThreads, view, query, sort)
    if (view !== "waiting") return shown
    /** A thread resolved in this view stays in the list until its undo window closes. */
    const heldHere = data.allThreads.filter((thread) => held.has(thread.id) && !shown.includes(thread))
    return [...shown, ...heldHere]
  }, [data.allThreads, held, query, sort, view])

  /** The open thread, worked out while rendering: when the one that was open leaves the list,
   *  its neighbour takes its place in the same pass, so the panel never blinks empty. */
  const lastIndex = useRef(0)
  const selected =
    list.find((thread) => thread.id === selectedId) ??
    list[Math.min(lastIndex.current, list.length - 1)] ??
    null
  const selectedIndex = selected ? list.indexOf(selected) : -1

  useEffect(() => {
    if (selectedIndex >= 0) lastIndex.current = selectedIndex
    if ((selected?.id ?? null) !== selectedId) setSelectedId(selected?.id ?? null)
  }, [selected, selectedId, selectedIndex])

  /** Open a thread from anywhere — a pin can name one the filters hide, so they make way. */
  const select = useCallback(
    (id: string) => {
      if (!list.some((thread) => thread.id === id)) {
        const target = data.allThreads.find((thread) => thread.id === id)
        if (target && view === "waiting" && target.resolved) setView("all")
        setQuery("")
      }
      setSelectedId(id)
    },
    [data.allThreads, list, view],
  )

  const isOpen = (thread: DashThread) => !thread.resolved && !held.has(thread.id)

  const nextWaiting = (() => {
    if (!selected) return null
    const others = (thread: DashThread) => thread.id !== selected.id && isOpen(thread)
    return list.slice(selectedIndex + 1).find(others) ?? list.find(others) ?? null
  })()

  /** Every thread on the same page (or quiz) as the selected one, the selected one included. */
  const samePage = selected
    ? data.allThreads.filter(
        (thread) =>
          (thread.pageId !== null && thread.pageId === selected.pageId) ||
          (thread.quiz !== null && thread.quiz.id === selected.quiz?.id),
      )
    : []

  return {
    ready: data.status === "ready",
    loading: data.status === "loading",
    view,
    setView,
    sort,
    setSort,
    query,
    setQuery,
    stats,
    waitingNow,
    list,
    selected,
    setSelectedId: select,
    held,
    failed,
    hold,
    undo,
    nextWaiting,
    samePage,
    locations,
    locate,
    drafts: drafts.current,
  }
}

export type FeedbackWorkspace = ReturnType<typeof useFeedbackWorkspace>
