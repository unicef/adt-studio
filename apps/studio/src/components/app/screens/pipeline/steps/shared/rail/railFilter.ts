import type { RailEntry } from "../ui"

export function entryPageNumber(entry: RailEntry): number | null {
  if (entry.pageNumber != null) return entry.pageNumber
  const match = /\d+/.exec(entry.title)
  return match ? Number(match[0]) : null
}

export function matchesRailQuery(entry: RailEntry, needle: string): boolean {
  if (!needle) return true
  const number = entryPageNumber(entry)
  if (number != null && String(number).startsWith(needle)) return true
  return (entry.searchText ?? entry.subtitle ?? "").toLowerCase().includes(needle)
}
