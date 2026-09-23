import type { DashThread } from "./dashboard-data"

export type FeedbackView = "waiting" | "resolved" | "all"
export type FeedbackSort = "newest" | "oldest" | "page"

/** The threads a view shows, matched against a free-text query (body, author, replies, page). */
export function visibleThreads(
  all: DashThread[],
  view: FeedbackView,
  query: string,
  sort: FeedbackSort,
): DashThread[] {
  const needle = query.trim().toLocaleLowerCase()
  const matches = all.filter((thread) => {
    if (view === "waiting" && thread.resolved) return false
    if (view === "resolved" && !thread.resolved) return false
    if (needle === "") return true
    const haystack = [thread.body, thread.authorName, thread.pageLabel, ...thread.replies.map((reply) => reply.body)]
      .join("\n")
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
  const at = (thread: DashThread) => Date.parse(thread.lastActivityAt) || 0
  if (sort === "newest") return [...matches].sort((a, b) => at(b) - at(a))
  if (sort === "oldest") return [...matches].sort((a, b) => at(a) - at(b))
  return [...matches].sort(
    (a, b) =>
      (a.pageNumber ?? Number.MAX_SAFE_INTEGER) - (b.pageNumber ?? Number.MAX_SAFE_INTEGER) ||
      (a.sectionNumber ?? 0) - (b.sectionNumber ?? 0) ||
      at(b) - at(a),
  )
}

export interface PageGroup {
  key: string
  pageNumber: number | null
  threads: DashThread[]
}

/** Consecutive threads on the same page, for the "by page" sort. */
export function groupByPage(threads: DashThread[]): PageGroup[] {
  const groups: PageGroup[] = []
  for (const thread of threads) {
    const key = thread.pageId ?? "unknown"
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.threads.push(thread)
    else groups.push({ key, pageNumber: thread.pageNumber, threads: [thread] })
  }
  return groups
}

export interface FeedbackStats {
  waiting: number
  resolved: number
}

/** How many threads wait on the author, and how many are settled. */
export function feedbackStats(all: DashThread[]): FeedbackStats {
  const resolved = all.filter((thread) => thread.resolved).length
  return { waiting: all.length - resolved, resolved }
}
