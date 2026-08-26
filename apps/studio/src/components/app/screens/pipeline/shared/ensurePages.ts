import type { QueryClient } from "@tanstack/react-query"
import type { PageSummaryItem } from "@/api/client"
import { pagesQueryOptions } from "@/hooks/use-pages"

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
