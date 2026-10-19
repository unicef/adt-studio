import { useQueries } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { ConversionPicker, type LoadState } from "./ConversionPicker"
import { Report } from "./report/Report"
import { MAX_RUNS, SERIES_COLORS, type RunView } from "../lib/run-view"
import type { ConversionEntry, ConversionListing } from "../lib/types"
import { getConversion } from "../server/functions"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function ConversionWorkspace({ listing }: { listing: ConversionListing }) {
  const [selected, setSelected] = useState<{ name: string; color: string }[]>([])
  const entries = useMemo(() => new Map(listing.conversions.map((c) => [c.name, c])), [listing])
  const active = selected.filter((s) => entries.has(s.name))

  const queries = useQueries({
    queries: active.map((s) => ({
      queryKey: ["conversion", listing.booksDir, s.name, entries.get(s.name)?.dbModified],
      queryFn: () => getConversion({ data: { booksDir: listing.booksDir, name: s.name } }),
    })),
  })

  const loads: Record<string, LoadState> = {}
  active.forEach((s, i) => {
    const query = queries[i]
    loads[s.name] = query.isSuccess ? { status: "ready" } : query.isError ? { status: "error", message: errorMessage(query.error) } : { status: "loading" }
  })

  const allReady = active.length > 0 && queries.every((q) => q.isSuccess)
  const runs: RunView[] = allReady ? active.flatMap((s, i) => {
    const summary = queries[i].data
    return summary ? [{ ...summary, color: s.color }] : []
  }) : []

  function toggle(conversion: ConversionEntry) {
    if (active.some((s) => s.name === conversion.name)) {
      setSelected(active.filter((s) => s.name !== conversion.name))
      return
    }
    if (active.length >= MAX_RUNS) return
    const color = SERIES_COLORS.find((c) => !active.some((s) => s.color === c)) ?? SERIES_COLORS[0]
    setSelected([...active, { name: conversion.name, color }])
  }

  function makeBase(name: string) {
    const target = active.find((s) => s.name === name)
    if (target) setSelected([target, ...active.filter((s) => s.name !== name)])
  }

  return (
    <>
      <ConversionPicker conversions={listing.conversions} selected={active} loads={loads} onToggle={toggle} onMakeBase={makeBase} />
      {active.length > 0 && !allReady && !queries.some((q) => q.isError) && <p className="text-sm text-muted">Reading the selected databases…</p>}
      {runs.length > 0 && <Report runs={runs} />}
    </>
  )
}
