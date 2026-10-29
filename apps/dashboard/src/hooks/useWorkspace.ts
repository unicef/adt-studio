import { useQueries } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import type { PriceTier } from "../lib/pricing"
import { MAX_RUNS, SERIES_COLORS, type RunView } from "../lib/run-view"
import type { ConversionEntry, ConversionListing } from "../lib/types"
import { getConversion } from "../server/functions"

export type LoadState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string }

export interface Selection {
  name: string
  color: string
}

export interface Workspace {
  conversions: ConversionEntry[]
  selected: Selection[]
  loads: Record<string, LoadState>
  runs: RunView[]
  pending: boolean
  booksDir: string
  modified: (name: string) => number
  bookUrl: (route: BookRoute, name: string, params?: Record<string, string>) => string
  coverUrl: (name: string) => string
  toggle: (name: string) => void
  makeBase: (name: string) => void
}

export type BookRoute = "/cover" | "/page" | "/page-image"

const NO_CONVERSIONS: ConversionEntry[] = []

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function useWorkspace(listing: ConversionListing | undefined, tier: PriceTier): Workspace {
  const booksDir = listing?.booksDir ?? ""
  const conversions = listing?.conversions ?? NO_CONVERSIONS
  const [state, setState] = useState<{ booksDir: string; items: Selection[] }>({ booksDir, items: [] })
  const entries = useMemo(() => new Map(conversions.map((c) => [c.name, c])), [conversions])
  const selected = state.booksDir === booksDir ? state.items.filter((s) => entries.has(s.name)) : []

  const queries = useQueries({
    queries: selected.map((s) => ({
      queryKey: ["conversion", booksDir, s.name, entries.get(s.name)?.dbModified, tier],
      queryFn: () => getConversion({ data: { booksDir, name: s.name, tier } }),
    })),
  })

  const loads: Record<string, LoadState> = {}
  selected.forEach((s, i) => {
    const query = queries[i]
    loads[s.name] = query.isSuccess ? { status: "ready" } : query.isError ? { status: "error", message: errorMessage(query.error) } : { status: "loading" }
  })

  const allReady = selected.length > 0 && queries.every((q) => q.isSuccess)
  const runs: RunView[] = allReady
    ? selected.flatMap((s, i) => {
        const summary = queries[i].data
        return summary ? [{ ...summary, color: s.color }] : []
      })
    : []

  const commit = (items: Selection[]) => setState({ booksDir, items })
  const modified = (name: string) => entries.get(name)?.dbModified ?? 0
  const bookUrl = (route: BookRoute, name: string, params: Record<string, string> = {}) =>
    `${route}?${new URLSearchParams({ booksDir, name, ...params, v: String(modified(name)) })}`

  return {
    conversions,
    selected,
    loads,
    runs,
    pending: selected.length > 0 && !allReady && !queries.some((q) => q.isError),
    booksDir,
    modified,
    bookUrl,
    coverUrl: (name) => bookUrl("/cover", name),
    toggle(name) {
      if (selected.some((s) => s.name === name)) {
        commit(selected.filter((s) => s.name !== name))
        return
      }
      if (selected.length >= MAX_RUNS) return
      const color = SERIES_COLORS.find((c) => !selected.some((s) => s.color === c)) ?? SERIES_COLORS[0]
      commit([...selected, { name, color }])
    },
    makeBase(name) {
      const target = selected.find((s) => s.name === name)
      if (target) commit([target, ...selected.filter((s) => s.name !== name)])
    },
  }
}
