import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { preloadPageThumbnail } from "@/components/app/screens/pipeline/shared/page-thumbnail/pageThumbnail"

/**
 * Warms the page-detail cache and the browser's image cache for the pages
 * reachable from the open detail (prev/next), so stepping through pages renders
 * instantly. Only the sized page-view thumbnail is preloaded, never the
 * full-resolution page image.
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
      preloadPageThumbnail(label, pageId)
    }
  }, [label, prevPageId, nextPageId, queryClient])
}
