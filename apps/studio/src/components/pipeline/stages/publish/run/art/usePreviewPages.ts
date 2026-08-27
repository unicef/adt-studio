import { useMemo } from "react"
import { getPageRenderUrl } from "@/api/client"
import { usePages } from "@/hooks/use-pages"

/**
 * Real page image URLs for whichever book the gallery is pointed at.
 *
 * Capped hard. Every animation on the bench is specified to use a handful of thumbnails — three,
 * six, seven — never one per page, because the number of pictures on screen must not track the
 * length of the book. Handing an animation the whole book would let it accidentally become a
 * progress bar made of pictures, which is the failure this whole design is avoiding.
 *
 * Spread across the book rather than taken from the front, so a cover, some body pages and
 * something from the back all appear — three consecutive front-matter pages look identical and
 * make the art look broken.
 */
export function usePreviewPages(label: string | null, count = 8): readonly string[] {
  const pages = usePages(label ?? "", { enabled: !!label })

  return useMemo(() => {
    if (!label) return []
    const withRenders = (pages.data ?? []).filter((page) => page.hasRendering)
    if (withRenders.length === 0) return []
    const stride = Math.max(1, Math.floor(withRenders.length / count))
    return withRenders
      .filter((_page, index) => index % stride === 0)
      .slice(0, count)
      .map((page) => getPageRenderUrl(label, page.pageId))
  }, [label, pages.data, count])
}
