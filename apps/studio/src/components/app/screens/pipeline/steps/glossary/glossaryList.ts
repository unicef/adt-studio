import type { TermOccurrence } from "@/components/pipeline/stages/glossary/lib/occurrences"
import type { GlossarySort } from "./SortMenu"
import type { GlossaryRow } from "./glossaryRows"

export type GlossaryFilter = "active" | "pruned" | "all"
export type PrunedMode = "inline" | "tray"

export interface GlossaryListState {
  search: string
  filter: GlossaryFilter
  mineOnly: boolean
  sort: GlossarySort
}

export interface GlossaryListResult {
  main: GlossaryRow[]
  tray: GlossaryRow[]
  counts: { active: number; pruned: number; all: number; mine: number }
  matches: { shown: number; total: number }
}

export function occurrenceKey(row: GlossaryRow): string {
  return row.id ?? row.word
}

function matchesSearch(row: GlossaryRow, query: string): boolean {
  if (!query) return true
  return [row.word, row.definition, ...row.variations, ...row.emojis].join(" ").toLocaleLowerCase().includes(query)
}

export function buildGlossaryList(
  rows: readonly GlossaryRow[],
  occurrences: ReadonlyMap<string, TermOccurrence>,
  mode: PrunedMode,
  state: GlossaryListState,
): GlossaryListResult {
  const query = state.search.trim().toLocaleLowerCase()
  const pruned = rows.filter((row) => row.pruned)
  const counts = {
    active: rows.length - pruned.length,
    pruned: pruned.length,
    all: rows.length,
    mine: rows.filter((row) => row.source === "manual").length,
  }
  const usage = (row: GlossaryRow) => occurrences.get(occurrenceKey(row))?.count ?? 0
  const firstPage = (row: GlossaryRow) => occurrences.get(occurrenceKey(row))?.pages[0] ?? Number.POSITIVE_INFINITY
  const byWord = (a: GlossaryRow, b: GlossaryRow) => a.word.localeCompare(b.word, undefined, { sensitivity: "base" })
  const order = (list: GlossaryRow[]) => {
    const sorted = [...list]
    if (state.sort === "az") sorted.sort(byWord)
    else if (state.sort === "za") sorted.sort((a, b) => byWord(b, a))
    else if (state.sort === "usage") sorted.sort((a, b) => usage(b) - usage(a) || byWord(a, b))
    else if (state.sort === "rare") sorted.sort((a, b) => usage(a) - usage(b) || byWord(a, b))
    else sorted.sort((a, b) => firstPage(a) - firstPage(b) || byWord(a, b))
    return sorted
  }
  const mine = (row: GlossaryRow) => !state.mineOnly || row.source === "manual"
  const prunedOnly = state.filter === "pruned"
  const useTray = mode === "tray" && !prunedOnly
  const inScope = useTray
    ? rows.filter(mine)
    : rows.filter((row) => mine(row) && (state.filter === "all" || (prunedOnly ? row.pruned : !row.pruned)))
  const found = inScope.filter((row) => matchesSearch(row, query))
  const main = order(useTray ? found.filter((row) => !row.pruned) : found)
  const tray = useTray ? order(found.filter((row) => row.pruned)) : []
  return { main, tray, counts, matches: { shown: main.length + tray.length, total: inScope.length } }
}
