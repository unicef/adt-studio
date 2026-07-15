import type { PageRange } from "../../api/client"

export const fmtRange = (r: PageRange) =>
  r.startPage === r.endPage ? `${r.startPage}` : `${r.startPage}–${r.endPage}`

export const rangeKey = (r: PageRange) => `${r.startPage}-${r.endPage}`

/** Per-page lifecycle state, in pipeline order. */
export type CoverageState = "merged" | "exported" | "pending"

export interface CoverageSegment {
  state: CoverageState
  startPage: number
  endPage: number
  pages: number
}

/**
 * Coalesce the book's pages into contiguous runs by lifecycle state so a single
 * proportional bar can show, at a glance, how much of the book is merged back
 * (done), exported but still out for processing, or not split yet. Page state
 * priority: merged > exported > pending.
 */
export function computeCoverageSegments(status: {
  pageCount: number
  exported: PageRange[]
  mergedRanges: PageRange[]
}): CoverageSegment[] {
  const { pageCount } = status
  if (pageCount <= 0) return []
  const inRanges = (ranges: PageRange[], p: number) =>
    ranges.some((r) => p >= r.startPage && p <= r.endPage)
  const stateOf = (p: number): CoverageState =>
    inRanges(status.mergedRanges, p)
      ? "merged"
      : inRanges(status.exported, p)
        ? "exported"
        : "pending"
  const segments: CoverageSegment[] = []
  for (let p = 1; p <= pageCount; p++) {
    const s = stateOf(p)
    const last = segments[segments.length - 1]
    if (last && last.state === s) {
      last.endPage = p
      last.pages += 1
    } else {
      segments.push({ state: s, startPage: p, endPage: p, pages: 1 })
    }
  }
  return segments
}

/**
 * Split `1..pageCount` into `n` contiguous, roughly-equal page windows (sizes
 * differ by at most one page). In `spreadMode` the split is computed in
 * indivisible spread units that mirror the extractor: page 1 is a standalone
 * cover, then pages pair as (2,3), (4,5), … (an even page with the next odd
 * page), with a trailing even page left standalone. Those units are grouped
 * into roughly-equal windows so a window never splits a spread — each window
 * then starts on page 1 or an even page and ends on an odd page (or the last
 * page), matching the backend's `snapSpreadRange`. These are starting
 * suggestions the coordinator can still adjust per export.
 */
export function computeEqualWindows(
  pageCount: number,
  n: number,
  opts: { spreadMode?: boolean } = {},
): PageRange[] {
  if (pageCount <= 0 || n <= 0) return []

  if (opts.spreadMode) {
    // Indivisible units: page 1 alone, then (2,3), (4,5), … clamped to the end.
    const units: PageRange[] = [{ startPage: 1, endPage: 1 }]
    for (let p = 2; p <= pageCount; p += 2) {
      units.push({ startPage: p, endPage: Math.min(p + 1, pageCount) })
    }
    const parts = Math.min(n, units.length)
    const base = Math.floor(units.length / parts)
    const remainder = units.length % parts
    const windows: PageRange[] = []
    let u = 0
    for (let i = 0; i < parts; i++) {
      const count = base + (i < remainder ? 1 : 0)
      windows.push({ startPage: units[u].startPage, endPage: units[u + count - 1].endPage })
      u += count
    }
    return windows
  }

  const parts = Math.min(n, pageCount)
  const base = Math.floor(pageCount / parts)
  const remainder = pageCount % parts
  const windows: PageRange[] = []
  let start = 1
  for (let i = 0; i < parts; i++) {
    const size = base + (i < remainder ? 1 : 0)
    const end = Math.min(start + size - 1, pageCount)
    windows.push({ startPage: start, endPage: end })
    start = end + 1
  }
  return windows
}
