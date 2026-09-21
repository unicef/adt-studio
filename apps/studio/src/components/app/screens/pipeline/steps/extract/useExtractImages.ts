import { useCallback, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, BASE_URL, type PageDetail } from "@/api/client"
import { useApiKey } from "@/hooks/use-api-key"
import { useSaveImageClassification } from "@/hooks/use-page-mutations"
import { usePendingChanges } from "@/components/pipeline/components/change-summary"
import type { SegmentRegion } from "@/components/pipeline/stages/storyboard/components/SegmentPreviewDialog"

export type ImageClassData = NonNullable<PageDetail["imageClassification"]>

export interface SegmentPreviewState {
  imageId: string
  imageSrc: string
  imageWidth: number
  imageHeight: number
  regions: SegmentRegion[]
}

export function extractedImageUrl(label: string, imageId: string, cacheKey?: number): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const bust = cacheKey ? `?v=${cacheKey}` : ""
  return `${BASE_URL}/books/${label}/images/${imageId}${bust}`
}

export function useExtractImages(label: string, pageId: string, page: PageDetail | undefined, blocked: boolean) {
  const { t } = useLingui()
  const { apiKey } = useApiKey()
  const queryClient = useQueryClient()
  const [pendingImageData, setPendingImageData] = useState<ImageClassData | null>(null)
  const [cropTargetId, setCropTargetId] = useState<string | null>(null)
  const [segmentPreview, setSegmentPreview] = useState<SegmentPreviewState | null>(null)
  const [segmentError, setSegmentError] = useState<string | null>(null)
  const [cacheKey, setCacheKey] = useState(0)

  const serverData = page?.imageClassification ?? null
  const effective = pendingImageData ?? serverData

  const pending = usePendingChanges({
    prev: serverData?.images ?? [],
    next: pendingImageData?.images,
    keyOf: (i) => i.imageId,
    isEqual: (a, b) => !!a.isPruned === !!b.isPruned,
    classifyChanged: (before, after) =>
      after.isPruned && !before.isPruned ? "pruned" : "restored",
    includeAddRemove: false,
    noun: { one: t`image`, other: t`images` },
  })

  const invalidatePage = async () => {
    await queryClient.invalidateQueries({ queryKey: ["books", label, "pages", pageId] })
    void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
  }

  const save = useSaveImageClassification(label, pageId)

  const saveChanges = () => {
    if (!pendingImageData || blocked) return
    save.mutate(pendingImageData, { onSuccess: () => setPendingImageData(null) })
  }

  const discardChanges = useCallback(() => setPendingImageData(null), [])
  const openCrop = useCallback((imageId: string) => setCropTargetId(imageId), [])
  const closeCrop = useCallback(() => setCropTargetId(null), [])

  const togglePrune = useCallback(
    (imageId: string) => {
      setPendingImageData((prev) => {
        const base = prev ?? serverData
        if (!base) return prev
        return {
          ...base,
          images: base.images.map((img) =>
            img.imageId === imageId
              ? { ...img, isPruned: !img.isPruned, reason: img.isPruned ? undefined : "manual" }
              : img,
          ),
        }
      })
    },
    [serverData],
  )

  const recrop = useMutation({
    mutationFn: async ({ imageId, blob }: { imageId: string; blob: Blob }) => {
      const result = await api.uploadCroppedImage(label, pageId, imageId, blob)
      const base = pendingImageData ?? serverData
      if (base) {
        await api.updateImageClassification(label, pageId, {
          ...base,
          images: base.images.map((img) =>
            img.imageId === imageId ? { ...img, imageId: result.imageId } : img,
          ),
        })
      }
    },
    onSuccess: async () => {
      await invalidatePage()
      setPendingImageData(null)
      setCacheKey((n) => n + 1)
      setCropTargetId(null)
    },
  })

  const segment = useMutation({
    mutationFn: async (imageId: string) => {
      const result = await api.segmentImage(label, imageId, pageId, apiKey)
      const width = result.imageWidth
      const height = result.imageHeight
      if (!width || !height) throw new Error(t`Could not read image dimensions`)
      const regions: SegmentRegion[] =
        result.regions && result.regions.length > 0
          ? result.regions
          : [{ label: t`Region`, cropLeft: 0, cropTop: 0, cropRight: width, cropBottom: height }]
      return { imageId, imageWidth: width, imageHeight: height, regions }
    },
    onMutate: () => setSegmentError(null),
    onSuccess: (data) =>
      setSegmentPreview({ ...data, imageSrc: extractedImageUrl(label, data.imageId) }),
    onError: (err) =>
      setSegmentError(err instanceof Error ? err.message : t`Segmentation failed`),
  })

  const applySegmentation = useMutation({
    mutationFn: async ({
      imageId,
      regions,
    }: {
      imageId: string
      regions: SegmentRegion[]
    }) => {
      const result = await api.applySegmentation(label, imageId, pageId, regions)
      if (!result.segments || result.segments.length === 0) {
        throw new Error(t`Segmentation produced no valid segments`)
      }
      const base = pendingImageData ?? serverData
      if (base) {
        await api.updateImageClassification(label, pageId, {
          ...base,
          images: base.images.flatMap((img) =>
            img.imageId === imageId
              ? [
                  { ...img, isPruned: true, reason: "segmented" },
                  ...result.segments.map((seg) => ({ imageId: seg.imageId, isPruned: false })),
                ]
              : [img],
          ),
        })
      }
    },
    onMutate: () => setSegmentError(null),
    onSuccess: async () => {
      await invalidatePage()
      setPendingImageData(null)
      setCacheKey((n) => n + 1)
      setSegmentPreview(null)
    },
    onError: (err) =>
      setSegmentError(err instanceof Error ? err.message : t`Segmentation apply failed`),
  })

  return {
    effective,
    pendingImageData,
    pendingLabel: pending.label,
    pendingLabelKey: pending.labelKey,
    isDirty: pending.hasChanges,
    cacheKey,
    save,
    saveChanges,
    discardChanges,
    togglePrune,
    cropTargetId,
    openCrop,
    closeCrop,
    recrop,
    segment,
    segmentingId: segment.isPending ? (segment.variables ?? null) : null,
    segmentPreview,
    closeSegmentPreview: () => setSegmentPreview(null),
    applySegmentation,
    segmentError,
    dismissSegmentError: () => setSegmentError(null),
  }
}

export type ExtractImagesApi = ReturnType<typeof useExtractImages>
