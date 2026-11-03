import type { PageSummaryItem } from "@/api/client"

/** Current navigation positions, keyed by persisted identity. Allocation suffixes
 * are never positions. Ambiguous or absent identities have no edit destination. */
export function currentSectionLocations(pages: readonly PageSummaryItem[]) {
  const locations = new Map<string, { pageId: string; pageNumber: number; sectionIndex: number }>()
  const seen = new Set<string>()
  for (const page of pages) {
    for (const section of page.sections) {
      const id = section.sectionId
      if (typeof id !== "string" || !id.trim()) continue
      if (seen.has(id)) locations.delete(id)
      else locations.set(id, { pageId: page.pageId, pageNumber: page.pageNumber, sectionIndex: section.sectionIndex })
      seen.add(id)
    }
  }
  return locations
}
