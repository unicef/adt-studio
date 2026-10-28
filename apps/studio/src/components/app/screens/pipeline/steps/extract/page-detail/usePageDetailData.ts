import { useMemo, useState } from "react"
import { resolveReflowableFont } from "@adt/types"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePrefetchAdjacentPages } from "../../shared/usePrefetchAdjacentPages"
import { useExtractImages } from "../useExtractImages"

export interface ImageBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PageImageEntry {
  imageId: string
  number: number
  isPruned: boolean
  reason?: string
  bounds?: ImageBounds
  width?: number
  height?: number
}

export interface PageSize {
  w: number
  h: number
}

export function usePageDetailData(label: string, pageId: string, prevPageId: string | null, nextPageId: string | null) {
  const query = usePage(label, pageId)
  const page = query.data
  const { data: imageData } = usePageImage(label, pageId)
  const { data: activeConfigData } = useActiveConfig(label)
  const { hasApiKey } = useApiKey()
  const { stageState, stepState } = useBookRun()
  const [loadedSize, setLoadedSize] = useState<PageSize | null>(null)
  usePrefetchAdjacentPages(label, prevPageId, nextPageId)

  const storyboardState = stageState("storyboard")
  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const storyboardDone = storyboardState === "done"
  const metadataRunning = stepState("metadata") === "running"
  const imageFilterRunning = stepState("image-filtering") === "running"

  const images = useExtractImages(label, pageId, page, storyboardRunning)
  const pageSrc = imageData?.imageBase64 ? `data:image/png;base64,${imageData.imageBase64}` : null
  const pageImageId = `${pageId}_page`

  const metaById = useMemo(() => new Map((page?.imagesMeta ?? []).map((meta) => [meta.imageId, meta])), [page?.imagesMeta])
  const metaOrder = useMemo(() => new Map((page?.imagesMeta ?? []).map((meta, index) => [meta.imageId, index])), [page?.imagesMeta])
  const pageImageMeta = metaById.get(pageImageId)
  const pageSize: PageSize | null =
    pageImageMeta?.width && pageImageMeta.height ? { w: pageImageMeta.width, h: pageImageMeta.height } : loadedSize

  const entries = useMemo<PageImageEntry[]>(() => {
    const list = (images.effective?.images ?? []).filter((image) => image.imageId !== pageImageId)
    return [...list]
      .sort((a, b) => (metaOrder.get(a.imageId) ?? Infinity) - (metaOrder.get(b.imageId) ?? Infinity) || a.imageId.localeCompare(b.imageId))
      .map((image, index) => {
        const meta = metaById.get(image.imageId)
        return {
          imageId: image.imageId,
          number: index + 1,
          isPruned: !!image.isPruned,
          reason: image.reason,
          bounds: meta?.bounds ?? undefined,
          width: meta?.width ?? undefined,
          height: meta?.height ?? undefined,
        }
      })
  }, [images.effective, metaById, metaOrder, pageImageId])

  const reflowableFont = page?.fontProfile?.category
    ? resolveReflowableFont((activeConfigData as { reflowable_font?: string } | undefined)?.reflowable_font, page.fontProfile.category)
    : null

  return {
    query,
    page,
    images,
    entries,
    pageSrc,
    pageImageId,
    pageSize,
    onPageImageSize: pageImageMeta?.width && pageImageMeta.height ? undefined : setLoadedSize,
    reflowableFont,
    hasApiKey,
    storyboardRunning,
    storyboardDone,
    metadataRunning,
    imageFilterRunning,
  }
}

export type PageDetailData = ReturnType<typeof usePageDetailData>
