import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"

/**
 * Warms the page-detail and page-image caches for the pages reachable from the
 * open detail (prev/next), so stepping through pages renders instantly instead
 * of blocking on two fetches per navigation.
 */
export function usePrefetchAdjacentPages(
  label: string,
  prevPageId: string | null,
  nextPageId: string | null,
): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    for (const pageId of [prevPageId, nextPageId]) {
      if (!pageId) continue
      void queryClient.prefetchQuery({
        queryKey: ["books", label, "pages", pageId],
        queryFn: () => api.getPage(label, pageId),
        staleTime: 30_000,
      })
      void queryClient.prefetchQuery({
        queryKey: ["books", label, "pages", pageId, "image"],
        queryFn: () => api.getPageImage(label, pageId),
        staleTime: Infinity,
      })
    }
  }, [label, prevPageId, nextPageId, queryClient])
}
