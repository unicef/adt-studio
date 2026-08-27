import type { PageEntry } from "@/features/navigation/state/nav.atoms"

/**
 * Section IDs encode their page range, e.g.:
 *   pg001_sec001    -> page 1
 *   pg004005_sec001 -> pages 4-5
 *   pg010_sec001    -> page 10
 * 6-digit prefix = start (first 3) + end (last 3); 3-digit prefix = single page.
 * Returns `[start, end]` or `null` if the id doesn't match the convention.
 */
export function pageRangeFromSectionId(id: string): [number, number] | null {
  const match = id.match(/^pg(\d+)/)
  if (!match) return null
  const digits = match[1]
  if (digits.length === 6) {
    const start = Number.parseInt(digits.slice(0, 3), 10)
    const end = Number.parseInt(digits.slice(3, 6), 10)
    if (Number.isFinite(start) && Number.isFinite(end)) return [start, end]
  }
  const n = Number.parseInt(digits, 10)
  return Number.isFinite(n) ? [n, n] : null
}

export function pageRangeForEntry(entry: PageEntry): [number, number] | null {
  const fromId = pageRangeFromSectionId(entry.section_id)
  if (fromId) return fromId
  if (typeof entry.page_number === "number") {
    return [entry.page_number, entry.page_number]
  }
  return null
}

export function getAdjacentPages(
  pages: PageEntry[],
  currentSectionId: string | null,
): {
  current: PageEntry | undefined
  index: number
  prev: PageEntry | undefined
  next: PageEntry | undefined
} {
  const index = pages.findIndex((p) => p.section_id === currentSectionId)
  return {
    current: index >= 0 ? pages[index] : undefined,
    index,
    prev: index > 0 ? pages[index - 1] : undefined,
    next: index >= 0 && index < pages.length - 1 ? pages[index + 1] : undefined,
  }
}

export function navigateToHref(href: string | undefined) {
  if (!href) return
  window.location.href = href
}
