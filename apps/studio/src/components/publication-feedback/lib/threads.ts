import type { PublicationPageEntry, PublishComment } from "@/api/client"

/**
 * The thread model the Feedback view reads, derived from the flat comment list the worker
 * returns. §4.9 of the API contract: threads are one level deep and **the root governs the
 * thread** — version, resolution and deletion are all read off the root.
 */

export interface FeedbackThread {
  root: PublishComment
  replies: PublishComment[]
  /** Replies the author can actually read — a deleted reply is a placeholder, not a reply. */
  replyCount: number
  resolved: boolean
  pageSectionId: string
  version: number
  /** Newest write anywhere in the thread; what "newest activity first" sorts on. */
  lastActivityAt: number
}

export interface PageThreadGroup {
  pageSectionId: string
  /** `null` for a page that is not in the published version's manifest. */
  page: PublicationPageEntry | null
  threads: FeedbackThread[]
}

export type ResolutionFilter = "unresolved" | "all"

export interface ThreadFilters {
  resolution: ResolutionFilter
  /** `null` = every page; otherwise only this page's threads. */
  pageSectionId: string | null
}

function activityAt(comment: PublishComment): number {
  const created = Date.parse(comment.created_at)
  const edited = comment.edited_at === null ? Number.NaN : Date.parse(comment.edited_at)
  const stamps = [created, edited].filter((value) => Number.isFinite(value))
  return stamps.length === 0 ? 0 : Math.max(...stamps)
}

export function buildThreads(comments: PublishComment[]): FeedbackThread[] {
  const roots = comments.filter((comment) => comment.parent_id === null)
  const repliesByRoot = new Map<string, PublishComment[]>()
  for (const comment of comments) {
    if (comment.parent_id === null) continue
    const bucket = repliesByRoot.get(comment.parent_id)
    if (bucket) bucket.push(comment)
    else repliesByRoot.set(comment.parent_id, [comment])
  }

  return roots.map((root) => {
    const replies = (repliesByRoot.get(root.id) ?? []).sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    )
    return {
      root,
      replies,
      replyCount: replies.filter((reply) => reply.deleted_at === null).length,
      resolved: root.resolved_at !== null,
      pageSectionId: root.page_section_id,
      version: root.version,
      lastActivityAt: Math.max(activityAt(root), ...replies.map(activityAt), 0),
    }
  })
}

export function filterThreads(
  threads: FeedbackThread[],
  filters: ThreadFilters,
): FeedbackThread[] {
  return threads.filter((thread) => {
    if (filters.resolution === "unresolved" && thread.resolved) return false
    if (filters.pageSectionId !== null && thread.pageSectionId !== filters.pageSectionId) {
      return false
    }
    return true
  })
}

/**
 * Manifest order for the pages the publication has, then anything left over — a thread whose
 * page is gone from the current version still has to be reachable, so it is grouped last
 * rather than dropped.
 */
export function groupThreadsByPage(
  threads: FeedbackThread[],
  pages: PublicationPageEntry[],
): PageThreadGroup[] {
  const byPage = new Map<string, FeedbackThread[]>()
  for (const thread of threads) {
    const bucket = byPage.get(thread.pageSectionId)
    if (bucket) bucket.push(thread)
    else byPage.set(thread.pageSectionId, [thread])
  }

  const groups: PageThreadGroup[] = []
  for (const page of pages) {
    const bucket = byPage.get(page.section_id)
    if (!bucket) continue
    byPage.delete(page.section_id)
    groups.push({ pageSectionId: page.section_id, page, threads: sortByActivity(bucket) })
  }
  for (const [pageSectionId, bucket] of byPage) {
    groups.push({ pageSectionId, page: null, threads: sortByActivity(bucket) })
  }
  return groups
}

function sortByActivity(threads: FeedbackThread[]): FeedbackThread[] {
  return [...threads].sort((a, b) => {
    if (b.lastActivityAt !== a.lastActivityAt) return b.lastActivityAt - a.lastActivityAt
    return a.root.id < b.root.id ? -1 : 1
  })
}

/** What the sidebar badge counts: open threads, deleted roots excluded. */
export function unresolvedThreadCount(comments: PublishComment[]): number {
  return comments.filter(
    (comment) =>
      comment.parent_id === null && comment.resolved_at === null && comment.deleted_at === null,
  ).length
}

/**
 * Where to open the frame. Landing on page one would show the cover, which almost never
 * carries feedback — the author came here to read comments, so the first page that has one
 * (in manifest order) is the honest first screen.
 */
export function firstPageWithFeedback(
  threads: FeedbackThread[],
  pages: PublicationPageEntry[],
): PublicationPageEntry | null {
  const open = new Set(
    threads.filter((thread) => !thread.resolved).map((thread) => thread.pageSectionId),
  )
  const any = new Set(threads.map((thread) => thread.pageSectionId))
  return (
    pages.find((page) => open.has(page.section_id)) ??
    pages.find((page) => any.has(page.section_id)) ??
    pages[0] ??
    null
  )
}

/**
 * Pin numbers are per page and follow creation order, so the number beside a thread in the
 * panel is the number drawn on the page — and it does not shuffle when the panel re-sorts on
 * activity. Only *anchored* threads are numbered: a whole-page comment draws no pin, so
 * counting it would leave a gap in the sequence the author reads off the page.
 */
export function pinNumbers(threads: FeedbackThread[]): Map<string, number> {
  const byPage = new Map<string, FeedbackThread[]>()
  for (const thread of threads) {
    if (thread.root.anchor === null) continue
    const bucket = byPage.get(thread.pageSectionId)
    if (bucket) bucket.push(thread)
    else byPage.set(thread.pageSectionId, [thread])
  }

  const numbers = new Map<string, number>()
  for (const bucket of byPage.values()) {
    const ordered = [...bucket].sort((a, b) => {
      const delta = Date.parse(a.root.created_at) - Date.parse(b.root.created_at)
      if (delta !== 0) return delta
      return a.root.id < b.root.id ? -1 : 1
    })
    ordered.forEach((thread, index) => numbers.set(thread.root.id, index + 1))
  }
  return numbers
}

const ELLIPSIS = "…"

/** One-glance form of a comment body for the list rows. Cuts on a word boundary. */
export function snippet(body: string, maxChars = 140): string {
  const flat = body.replace(/\s+/g, " ").trim()
  if (flat.length <= maxChars) return flat
  const cut = flat.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(" ")
  const kept = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${kept.trimEnd()}${ELLIPSIS}`
}

export type RelativeAge =
  | { unit: "now" }
  | { unit: "minutes"; value: number }
  | { unit: "hours"; value: number }
  | { unit: "days"; value: number }
  | { unit: "date"; value: number }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Bucketing is pure and testable; the wording lives in the component that has the catalog. */
export function relativeAge(iso: string, now: number = Date.now()): RelativeAge | null {
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) return null
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < MINUTE) return { unit: "now" }
  if (elapsed < HOUR) return { unit: "minutes", value: Math.floor(elapsed / MINUTE) }
  if (elapsed < DAY) return { unit: "hours", value: Math.floor(elapsed / HOUR) }
  if (elapsed < 7 * DAY) return { unit: "days", value: Math.floor(elapsed / DAY) }
  return { unit: "date", value: timestamp }
}

export function readableTextColor(hex: string): string {
  const value = hex.replace("#", "")
  if (value.length !== 6) return "#ffffff"
  const channel = (raw: number) =>
    raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4)
  const r = channel(Number.parseInt(value.slice(0, 2), 16) / 255)
  const g = channel(Number.parseInt(value.slice(2, 4), 16) / 255)
  const b = channel(Number.parseInt(value.slice(4, 6), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1a1a1a" : "#ffffff"
}
