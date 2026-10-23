import type { TocEntry, TocGenerationOutput, TocSection } from "@/api/client"

export const MIN_TOC_LEVEL = 1
export const MAX_TOC_LEVEL = 6

export const getEntries = (doc: TocGenerationOutput): TocEntry[] => doc.entries
export const setEntries = (doc: TocGenerationOutput, entries: TocEntry[]): TocGenerationOutput => ({ ...doc, entries })
export const entryKey = (entry: TocEntry): string => entry.id

export function sameEntry(a: TocEntry, b: TocEntry): boolean {
  return a.title === b.title && a.level === b.level && a.sectionId === b.sectionId && a.href === b.href
}

export function clampLevel(level: number): number {
  return Math.min(MAX_TOC_LEVEL, Math.max(MIN_TOC_LEVEL, level))
}

export function levelsUsed(entries: readonly TocEntry[]): number[] {
  return [...new Set(entries.map((entry) => entry.level))].sort((a, b) => a - b)
}

export function entryPageIds(entry: TocEntry, sections: readonly TocSection[], pageIdByNumber: ReadonlyMap<number, string>): string[] {
  if (!entry.sectionId) return []
  const pageNumber = sections.find((section) => section.sectionId === entry.sectionId)?.pageNumber
  const pageId = pageNumber != null ? pageIdByNumber.get(pageNumber) : undefined
  return pageId ? [pageId] : []
}
