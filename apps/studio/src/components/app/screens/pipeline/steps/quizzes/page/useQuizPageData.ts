import { usePage, usePages } from "@/hooks/use-pages"
import { lowResThumbnail, pageViewThumbnailUrl } from "@/components/app/screens/pipeline/shared/page-thumbnail/pageThumbnail"
import type { PageSize } from "../../shared/page-inspector/types"

export function useQuizPageData(label: string, pageId: string) {
  const query = usePage(label, pageId)
  const page = query.data
  const summary = usePages(label, { enabled: false }).data?.find((candidate) => candidate.pageId === pageId)
  const pageMeta = page?.imagesMeta?.find((entry) => entry.imageId === `${pageId}_page`)
  const pageSize: PageSize | null =
    pageMeta?.width && pageMeta.height
      ? { w: pageMeta.width, h: pageMeta.height }
      : summary?.pageWidth && summary.pageHeight
        ? { w: summary.pageWidth, h: summary.pageHeight }
        : null

  return {
    query,
    page,
    pageSize,
    pageSrc: pageViewThumbnailUrl(label, pageId),
    lowSrc: lowResThumbnail(label, pageId),
  }
}

export type QuizPageData = ReturnType<typeof useQuizPageData>
