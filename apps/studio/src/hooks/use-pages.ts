import { useQuery } from "@tanstack/react-query"
import { api, getSectionScreenshotUrl } from "@/api/client"

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

export interface SectionScreenshot {
  src: string
  width: number
  height: number
}

function preloadImage(src: string): Promise<SectionScreenshot> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error(`Screenshot unavailable: ${src}`))
    img.src = src
  })
}

/** Resolves once the browser has the screenshot decoded and cached, so the
 *  consuming <img> can swap in without a flash of empty frame. Carries the
 *  natural size, which is the only measure of how tall a section renders. */
export function useSectionScreenshot(
  label: string,
  pageId: string,
  sectionIndex: number | null,
  options?: {
    viewport?: "desktop" | "tablet" | "mobile"
    cacheKey?: string | number | null
    enabled?: boolean
  }
) {
  const viewport = options?.viewport ?? "desktop"
  const cacheKey = options?.cacheKey ?? null
  return useQuery({
    queryKey: [
      "books",
      label,
      "pages",
      pageId,
      "sections",
      sectionIndex,
      "screenshot",
      viewport,
      cacheKey,
    ],
    queryFn: () =>
      preloadImage(
        getSectionScreenshotUrl(label, pageId, sectionIndex as number, { viewport, cacheKey })
      ),
    enabled: !!label && !!pageId && sectionIndex != null && (options?.enabled ?? true),
    staleTime: Infinity,
    retry: false,
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
