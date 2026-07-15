import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"

export function usePages(
  label: string,
  options?: { refetchInterval?: number | false; refetchOnMount?: boolean | "always"; enabled?: boolean }
) {
  return useQuery({
    queryKey: ["books", label, "pages"],
    queryFn: () => api.getPages(label),
    // `enabled: false` still subscribes to (and re-renders on) the cached query
    // populated by other observers — it just won't trigger its own fetch.
    enabled: !!label && (options?.enabled ?? true),
    refetchOnMount: options?.refetchOnMount,
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export function usePage(label: string, pageId: string) {
  return useQuery({
    queryKey: ["books", label, "pages", pageId],
    queryFn: () => api.getPage(label, pageId),
    enabled: !!label && !!pageId,
  })
}

export function usePageImage(label: string, pageId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["books", label, "pages", pageId, "image"],
    queryFn: () => api.getPageImage(label, pageId),
    enabled: !!label && !!pageId && (options?.enabled ?? true),
    staleTime: Infinity, // Images don't change
  })
}

export function useAiEditHistory(
  label: string,
  pageId: string,
  sectionIndex: number,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["books", label, "pages", pageId, "ai-edit-history", sectionIndex],
    queryFn: () => api.aiEditHistory(label, pageId, sectionIndex),
    enabled: !!label && !!pageId && (options?.enabled ?? true),
  })
}
