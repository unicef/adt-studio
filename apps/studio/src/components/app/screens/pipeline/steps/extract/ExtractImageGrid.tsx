import { useMemo } from "react"
import { Image, Loader2, TriangleAlert, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { PageDetail } from "@/api/client"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { extractedImageUrl, type ExtractImagesApi, type ImageClassData } from "./useExtractImages"
import { ExtractImageCard, type ImageBounds } from "./ExtractImageCard"

export function ExtractImageGrid({
  label,
  pageId,
  page,
  images,
  hasPageImage,
  storyboardRunning,
  imageFilterRunning,
  hasApiKey,
  canRecrop,
  children,
}: {
  label: string
  pageId: string
  page: PageDetail
  images: ExtractImagesApi
  hasPageImage: boolean
  storyboardRunning: boolean
  imageFilterRunning: boolean
  hasApiKey: boolean
  canRecrop: boolean
  children?: React.ReactNode
}) {
  const { t } = useLingui()
  const pageImageId = `${pageId}_page`

  const boundsByImageId = useMemo(() => {
    const map = new Map<string, ImageBounds>()
    for (const meta of page.imagesMeta) {
      if (meta.bounds) map.set(meta.imageId, meta.bounds)
    }
    return map
  }, [page.imagesMeta])

  const dimsByImageId = useMemo(() => {
    const map = new Map<string, { width: number; height: number }>()
    for (const meta of page.imagesMeta) {
      if (meta.width && meta.height) map.set(meta.imageId, { width: meta.width, height: meta.height })
    }
    return map
  }, [page.imagesMeta])

  const extractedImages = useMemo(
    () =>
      (images.effective?.images.filter((img) => img.imageId !== pageImageId) ?? []).sort(
        (a, b) => Number(a.isPruned) - Number(b.isPruned),
      ),
    [images.effective, pageImageId],
  )

  const count = extractedImages.length + (hasPageImage ? 1 : 0)

  return (
    <>
      {count > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Image className="size-3" />
          <Trans>Extracted Images ({String(count)})</Trans>
          <div className="ml-auto normal-case tracking-normal">
            <VersionPicker
              step="image-filtering"
              itemId={pageId}
              currentVersion={page.versions.imageClassification}
              saving={images.save.isPending}
              dirty={images.isDirty}
              bookLabel={label}
              pendingLabel={images.pendingLabel}
              pendingLabelKey={images.pendingLabelKey}
              onRestored={images.discardChanges}
              onSave={images.saveChanges}
              onDiscard={images.discardChanges}
              diff={{
                items: (d) => (d as ImageClassData | null)?.images ?? [],
                keyOf: (it) => (it as ImageClassData["images"][number]).imageId,
                hideUnchanged: true,
                renderItem: (it) => {
                  const img = it as ImageClassData["images"][number]
                  const filtered = img.isPruned
                  return (
                    <span className="flex flex-col gap-1.5">
                      <img
                        src={extractedImageUrl(label, img.imageId)}
                        alt=""
                        className="max-h-[32vh] w-full rounded-md border bg-muted object-contain"
                      />
                      <span
                        className={cn(
                          "w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
                          filtered
                            ? "bg-rose-100 text-rose-700 ring-rose-300"
                            : "bg-emerald-100 text-emerald-700 ring-emerald-300",
                        )}
                      >
                        {filtered ? t`Filtered out` : t`Kept`}
                      </span>
                      {img.reason ? (
                        <span className="text-[11px] text-muted-foreground">{img.reason}</span>
                      ) : null}
                    </span>
                  )
                },
              }}
            />
          </div>
        </div>
      )}

      {images.segmentError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="flex-1">{images.segmentError}</span>
          <button
            type="button"
            onClick={images.dismissSegmentError}
            title={t`Close`}
            aria-label={t`Close`}
            className="shrink-0 rounded p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {children}

      {extractedImages.length > 0 ? (
        <div className="grid grid-cols-2 items-start gap-2">
          {extractedImages.map((img) => (
            <ExtractImageCard
              key={img.imageId}
              label={label}
              imageId={img.imageId}
              isPruned={img.isPruned}
              reason={img.reason}
              bounds={boundsByImageId.get(img.imageId)}
              width={dimsByImageId.get(img.imageId)?.width}
              height={dimsByImageId.get(img.imageId)?.height}
              cacheKey={images.cacheKey}
              segmenting={images.segmentingId === img.imageId}
              showRecrop={canRecrop && !storyboardRunning}
              showSegment={hasApiKey && !storyboardRunning}
              onTogglePrune={images.togglePrune}
              onRecrop={images.openCrop}
              onSegment={images.segment.mutate}
            />
          ))}
        </div>
      ) : imageFilterRunning && !images.effective ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <Trans>Classifying images…</Trans>
        </div>
      ) : null}
    </>
  )
}
