import { useMemo } from "react"
import { scopeItemsToPages, type PageRef, type PageScopedItems } from "./scopeItemsToPages"

export function usePageScopedItems<P extends PageRef, T>({
  pages,
  items,
  pagesOf,
}: {
  pages: readonly P[]
  items: readonly T[]
  pagesOf: (item: T) => readonly string[]
}): PageScopedItems<P, T> {
  return useMemo(() => scopeItemsToPages(pages, items, pagesOf), [pages, items, pagesOf])
}
