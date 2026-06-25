import type { PageRange } from "../../api/client"

export const fmtRange = (r: PageRange) =>
  r.startPage === r.endPage ? `${r.startPage}` : `${r.startPage}–${r.endPage}`

export const rangeKey = (r: PageRange) => `${r.startPage}-${r.endPage}`

/**
 * Split `1..pageCount` into `n` contiguous, roughly-equal page windows (sizes
 * differ by at most one page). In `spreadMode` the split is computed in
 * two-page-spread units — assuming spreads pair as (1,2), (3,4), … — so a
 * window never splits a spread; each window then starts on an odd page and
 * ends on an even one. These are starting suggestions the coordinator can
 * still adjust per export.
 */
export function computeEqualWindows(
  pageCount: number,
  n: number,
  opts: { spreadMode?: boolean } = {},
): PageRange[] {
  if (pageCount <= 0 || n <= 0) return []

  if (opts.spreadMode) {
    const spreads = Math.ceil(pageCount / 2) // spread i covers pages [2i+1, 2i+2]
    const parts = Math.min(n, spreads)
    const base = Math.floor(spreads / parts)
    const remainder = spreads % parts
    const windows: PageRange[] = []
    let spreadStart = 0
    for (let i = 0; i < parts; i++) {
      const count = base + (i < remainder ? 1 : 0)
      const startPage = spreadStart * 2 + 1
      const endPage = Math.min((spreadStart + count) * 2, pageCount)
      windows.push({ startPage, endPage })
      spreadStart += count
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
