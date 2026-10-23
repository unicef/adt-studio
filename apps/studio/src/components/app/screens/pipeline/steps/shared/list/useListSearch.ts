import { useMemo } from "react"

export function matchesQuery(fields: readonly (string | undefined | null)[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return fields.some((field) => field?.toLocaleLowerCase().includes(needle))
}

export function useListSearch<T>(items: readonly T[], query: string, fieldsOf: (item: T) => readonly (string | undefined | null)[]): T[] {
  return useMemo(() => items.filter((item) => matchesQuery(fieldsOf(item), query)), [items, query, fieldsOf])
}
