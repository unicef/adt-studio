import type { QueryClient } from "@tanstack/react-query"
import type { PageSummaryItem } from "@/api/client"
import { pagesQueryOptions } from "@/hooks/use-pages"

/**
 * Pages for a book, for use from route loaders and guards. The endpoint 404s
 * until the book has been extracted, which is an ordinary state rather than a
 * failure — the workspace opens on its empty canvas — so this resolves to an
 * empty list instead of rejecting.
 */
export async function ensurePages(
  queryClient: QueryClient,
  label: string,
): Promise<PageSummaryItem[]> {
  try {
    return await queryClient.ensureQueryData(pagesQueryOptions(label))
  } catch {
    return []
  }
}
