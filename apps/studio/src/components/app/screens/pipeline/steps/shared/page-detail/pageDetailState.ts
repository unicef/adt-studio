import type { PageDetailState } from "./PageDetailFrame"

export interface PageQueryState {
  isPending: boolean
  isError: boolean
  data?: unknown
  refetch: () => unknown
}

export function pageDetailState(query: PageQueryState, empty: boolean): PageDetailState {
  const loaded = query.data !== undefined
  if (query.isError && !loaded) return "error"
  if (query.isPending && !loaded) return "loading"
  return empty ? "empty" : "ready"
}

export function refreshFailed(query: PageQueryState): boolean {
  return query.isError && query.data !== undefined
}
