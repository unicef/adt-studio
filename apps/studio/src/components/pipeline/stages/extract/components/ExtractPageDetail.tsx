import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { AlertTriangle, Check, Crop, Eye, EyeOff, FileText, Image, ImageOff, Layers, Loader2, ChevronDown, Scissors, Square, Type, X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { api, BASE_URL } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { ImageCropDialog } from "@/components/pipeline/stages/storyboard/components/ImageCropDialog"
import { SegmentPreviewDialog, type SegmentRegion } from "@/components/pipeline/stages/storyboard/components/SegmentPreviewDialog"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { usePendingChanges } from "@/components/pipeline/components/change-summary"
import { resolveReflowableFont } from "@adt/types"

function ImageCard({ imageId, bookLabel, isPruned, reason, bounds, onTogglePrune, onRecrop, onSegment, segmenting, cacheBust }: { imageId: string; bookLabel: string; isPruned?: boolean; reason?: string; bounds?: { x: number; y: number; width: number; height: number }; onTogglePrune?: () => void; onRecrop?: () => void; onSegment?: () => void; segmenting?: boolean; cacheBust?: number }) {
  const { t } = useLingui()
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const imgSrc = `${BASE_URL}/books/${bookLabel}/images/${imageId}${cacheBust ? `?v=${cacheBust}` : ""}`

  return (
    <div
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] ${isPruned ? "opacity-40" : ""}`}
      title={isPruned && reason ? t`Pruned: ${reason}` : undefined}
    >
      {bounds && (
        <div
          className="absolute top-1 left-1 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-black/30 text-white"
          title={t`Position ${Math.round(bounds.x)}, ${Math.round(bounds.y)} → ${Math.round(bounds.width)}×${Math.round(bounds.height)} pt`}
        >
          <Square className="h-3 w-3" />
        </div>
      )}
      <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
        {onRecrop && (
          <button
            type="button"
            onClick={onRecrop}
            className="flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-colors bg-black/30 opacity-0 group-hover:opacity-100 hover:bg-black/50"
            title={t`Recrop from page`}
          >
            <Crop className="h-3 w-3 text-white" />
          </button>
        )}
        {onSegment && (
          <button
            type="button"
            onClick={onSegment}
            disabled={segmenting}
            className={`flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-colors disabled:cursor-default ${
              segmenting
                ? "bg-orange-500"
                : "bg-black/30 opacity-0 group-hover:opacity-100 hover:bg-black/50"
            }`}
            title={segmenting ? t`Segmenting…` : t`Segment image`}
          >
            {segmenting
              ? <Loader2 className="h-3 w-3 text-white animate-spin" />
              : <Scissors className="h-3 w-3 text-white" />
            }
          </button>
        )}
        <button
          type="button"
          onClick={onTogglePrune}
          className={`flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-colors ${
            isPruned
              ? "bg-destructive hover:bg-destructive/80"
              : "bg-black/30 opacity-0 group-hover:opacity-100 hover:bg-black/50"
          }`}
          title={isPruned ? t`Unprune image` : t`Prune image`}
        >
          {isPruned
            ? <EyeOff className="h-3 w-3 text-white" />
            : <Eye className="h-3 w-3 text-white" />
          }
        </button>
      </div>
      <img
        src={imgSrc}
        alt={imageId}
        className={`max-w-full h-auto block my-auto ${isPruned ? "grayscale" : ""}`}
        onLoad={(e) => {
          const img = e.target as HTMLImageElement
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = "none"
        }}
      />
      <div className="px-2 py-1 border-t bg-muted/30 w-full mt-auto">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground truncate">{imageId}</span>
          {dimensions && (
            <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
              {dimensions.w}&times;{dimensions.h}
            </span>
          )}
        </div>
        {isPruned && reason && (
          <p className="text-[10px] text-destructive/70 truncate mt-0.5" title={reason}>{reason}</p>
        )}
      </div>
    </div>
  )
}

type ImageClassData = NonNullable<import("@/api/client").PageDetail["imageClassification"]>

export function ExtractPageDetail({
  bookLabel,
  pageId,
}: {
  bookLabel: string
  pageId: string
}) {
  const { t } = useLingui()
  const { data: page, isLoading } = usePage(bookLabel, pageId)
  const { data: imageData } = usePageImage(bookLabel, pageId)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const [pageImageDims, setPageImageDims] = useState<{ w: number; h: number } | null>(null)
  const { stageState, stepState } = useBookRun()
  const storyboardRunning = stageState("storyboard") === "running" || stageState("storyboard") === "queued"
  const storyboardDone = stageState("storyboard") === "done"
  const metadataRunning = stepState("metadata") === "running"
  const imageFilterRunning = stepState("image-filtering") === "running"
  const [savingImages, setSavingImages] = useState(false)
  const [pendingImageData, setPendingImageData] = useState<ImageClassData | null>(null)
  const [cropTarget, setCropTarget] = useState<string | null>(null)
  const [cropPageSrc, setCropPageSrc] = useState<string | null>(null)
  const [cacheBust, setCacheBust] = useState(0)
  // Image segmentation state
  const [segmentingId, setSegmentingId] = useState<string | null>(null)
  const [segmentPreview, setSegmentPreview] = useState<{
    imageId: string
    imageSrc: string
    imageWidth: number
    imageHeight: number
    regions: SegmentRegion[]
  } | null>(null)
  const [segmentError, setSegmentError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Clear pending state when page changes
  useEffect(() => {
    setPendingImageData(null)
    setCropTarget(null)
    setCropPageSrc(null)
    setSegmentingId(null)
    setSegmentPreview(null)
    setSegmentError(null)
  }, [pageId])

  const handleRecropFromPage = useCallback(async (imageId: string) => {
    try {
      const { imageBase64 } = await api.getPageImage(bookLabel, pageId)
      setCropTarget(imageId)
      setCropPageSrc(`data:image/png;base64,${imageBase64}`)
    } catch {
      // silently fail — page image may not be available
    }
  }, [bookLabel, pageId])

  const handleCropApply = useCallback(async (blob: Blob) => {
    if (!cropTarget) return
    try {
      const result = await api.uploadCroppedImage(bookLabel, pageId, cropTarget, blob)
      // Swap old imageId → new imageId in imageClassification and save
      const base = pendingImageData ?? page?.imageClassification
      if (base) {
        const updated = {
          ...base,
          images: base.images.map((img) =>
            img.imageId === cropTarget ? { ...img, imageId: result.imageId } : img
          ),
        }
        await api.updateImageClassification(bookLabel, pageId, updated)
      }
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      setPendingImageData(null)
      setCacheBust((n) => n + 1)
    } finally {
      setCropTarget(null)
      setCropPageSrc(null)
    }
  }, [cropTarget, bookLabel, pageId, queryClient, pendingImageData, page?.imageClassification])

  // Run LLM segmentation analysis on an extracted image (phase 1: get bounding
  // boxes). The editor always opens: if the LLM detects a composite we seed its
  // boxes, otherwise we seed a single full-image box the user can adjust to crop.
  const handleSegment = useCallback(async (imageId: string) => {
    if (!hasApiKey || segmentingId) return
    setSegmentError(null)
    setSegmentingId(imageId)
    try {
      const result = await api.segmentImage(bookLabel, imageId, pageId, apiKey)
      const width = result.imageWidth
      const height = result.imageHeight
      if (!width || !height) {
        setSegmentError(t`Could not read image dimensions`)
        return
      }
      const regions: SegmentRegion[] =
        result.regions && result.regions.length > 0
          ? result.regions
          : [{ label: t`Region`, cropLeft: 0, cropTop: 0, cropRight: width, cropBottom: height }]
      setSegmentPreview({
        imageId,
        imageSrc: `${BASE_URL}/books/${bookLabel}/images/${imageId}`,
        imageWidth: width,
        imageHeight: height,
        regions,
      })
    } catch (err) {
      setSegmentError(err instanceof Error ? err.message : t`Segmentation failed`)
    } finally {
      setSegmentingId(null)
    }
  }, [bookLabel, pageId, apiKey, hasApiKey, segmentingId, t])

  // Apply confirmed segmentation (phase 2: crop, save, and add the new segment
  // images to the image-filtering classification. The original is kept but
  // pruned so it stays inspectable/restorable rather than disappearing).
  const handleSegmentApply = useCallback(async (confirmedRegions: SegmentRegion[]) => {
    if (!segmentPreview) return
    const { imageId } = segmentPreview
    setSegmentError(null)
    try {
      const result = await api.applySegmentation(bookLabel, imageId, pageId, confirmedRegions)
      if (!result.segments || result.segments.length === 0) {
        throw new Error(t`Segmentation produced no valid segments`)
      }
      const base = pendingImageData ?? page?.imageClassification
      if (base) {
        const updated = {
          ...base,
          images: base.images.flatMap((img) =>
            img.imageId === imageId
              ? [
                  { ...img, isPruned: true, reason: "segmented" },
                  ...result.segments.map((seg) => ({ imageId: seg.imageId, isPruned: false })),
                ]
              : [img]
          ),
        }
        await api.updateImageClassification(bookLabel, pageId, updated)
      }
      await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
      setPendingImageData(null)
      setCacheBust((n) => n + 1)
      // Close only after success — keeps the dialog (and the user's adjusted
      // regions) up while applying, so it can show its spinner and stay open
      // for retry if the apply fails.
      setSegmentPreview(null)
    } catch (err) {
      setSegmentError(err instanceof Error ? err.message : t`Segmentation apply failed`)
      // Rethrow so SegmentPreviewDialog resets its applying state and the user
      // can retry without re-running the (paid) LLM analysis.
      throw err
    }
  }, [segmentPreview, bookLabel, pageId, queryClient, pendingImageData, page?.imageClassification, t])

  // Effective data: pending if dirty, otherwise server
  const imageClassData = pendingImageData ?? page?.imageClassification ?? null

  const {
    label: pendingLabel,
    labelKey: pendingLabelKey,
    hasChanges: imageDirty,
  } = usePendingChanges({
    prev: page?.imageClassification?.images ?? [],
    next: pendingImageData?.images,
    keyOf: (i) => i.imageId,
    isEqual: (a, b) => !!a.isPruned === !!b.isPruned,
    classifyChanged: (before, after) =>
      after.isPruned && !before.isPruned ? "pruned" : "restored",
    includeAddRemove: false,
    noun: { one: t`image`, other: t`images` },
  })

  // Lookup for per-image page-placement bounds (when available from extract)
  const boundsByImageId = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const meta of page?.imagesMeta ?? []) {
      if (meta.bounds) map.set(meta.imageId, meta.bounds)
    }
    return map
  }, [page?.imagesMeta])

  const toggleImagePrune = (imageId: string) => {
    const base = pendingImageData ?? page?.imageClassification
    if (!base) return
    setPendingImageData({
      images: base.images.map((img) =>
        img.imageId === imageId
          ? { ...img, isPruned: !img.isPruned, reason: img.isPruned ? undefined : "manual" }
          : img
      ),
    })
  }

  const saveImageChanges = async () => {
    if (!pendingImageData || storyboardRunning) return
    setSavingImages(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateImageClassification(bookLabel, pageId, pendingImageData)
    setPendingImageData(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSavingImages(false)
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground"><Trans>Loading page...</Trans></div>
  }

  if (!page) return null

  // For reflowable books, map the detected serif/sans category (+ any config
  // override) to the base reading font, to show alongside the detection.
  const reflowableFont = page.fontProfile?.category
    ? resolveReflowableFont(
        (activeConfigData as { reflowable_font?: string } | undefined)?.reflowable_font,
        page.fontProfile.category,
      )
    : null

  return (
    <div className="space-y-2 p-4">
      {storyboardDone && (
        <div className="flex items-center gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <Trans>Storyboard has already been run. Changes made here will not take effect until storyboard is re-run.</Trans>
        </div>
      )}
      <div className="flex gap-6">
      {/* Left: Page image + extracted images */}
      <div className="w-[45%] shrink-0 space-y-4">
        {/* Extracted images header */}
        {(() => {
          const pageImageId = `${pageId}_page`
          const totalImages = imageClassData?.images.filter(
            (img) => img.imageId !== pageImageId
          ).length ?? 0
          const count = totalImages + (imageData ? 1 : 0)
          if (count === 0) return null
          return (
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Image className="h-3 w-3" />
              <Trans>Extracted Images ({String(count)})</Trans>
              <div className="ml-auto">
                <VersionPicker
                  step="image-filtering"
                  itemId={pageId}
                  currentVersion={page.versions.imageClassification}
                  saving={savingImages}
                  dirty={imageDirty}
                  bookLabel={bookLabel}
                  pendingLabel={pendingLabel}
                  pendingLabelKey={pendingLabelKey}
                  onPreview={(data) => setPendingImageData(data as ImageClassData)}
                  onSave={saveImageChanges}
                  onDiscard={() => setPendingImageData(null)}
                />
              </div>
            </h3>
          )
        })()}

        {/* Segmentation error notice */}
        {segmentError && (
          <div className="flex items-center gap-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{segmentError}</span>
            <button
              type="button"
              onClick={() => setSegmentError(null)}
              className="shrink-0 rounded p-0.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
              title={t`Close`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Page image */}
        {imageData ? (
          <div className="rounded border overflow-hidden shadow-sm">
            <img
              src={`data:image/png;base64,${imageData.imageBase64}`}
              alt={t`Page ${String(page.pageNumber)}`}
              className="w-full h-auto block"
              onLoad={(e) => {
                const img = e.target as HTMLImageElement
                setPageImageDims({ w: img.naturalWidth, h: img.naturalHeight })
              }}
            />
            <div className="px-2 py-1 flex items-center justify-between border-t bg-muted/30">
              <span className="text-[10px] text-muted-foreground truncate">
                {pageId}
                {t`_page`}
              </span>
              {pageImageDims && (
                <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                  {pageImageDims.w}&times;{pageImageDims.h}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded border bg-muted/50 text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <ImageOff className="h-6 w-6" />
              <Trans>No image available</Trans>
            </div>
          </div>
        )}

        {/* Other extracted images (excluding the page image) */}
        {(() => {
          const pageImageId = `${pageId}_page`
          const extractedImages = (imageClassData?.images.filter(
            (img) => img.imageId !== pageImageId
          ) ?? []).sort((a, b) => Number(a.isPruned) - Number(b.isPruned))
          if (extractedImages.length === 0) {
            if (imageFilterRunning && !imageClassData) {
              return (
                <div className="flex items-center gap-2 rounded border border-dashed p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <Trans>Classifying images…</Trans>
                </div>
              )
            }
            return null
          }
          return (
            <div className="grid grid-cols-2 gap-2 items-start">
              {extractedImages.map((img) => (
                <div key={img.imageId} className="group">
                  <ImageCard
                    imageId={img.imageId}
                    bookLabel={bookLabel}
                    isPruned={img.isPruned}
                    reason={img.reason}
                    bounds={boundsByImageId.get(img.imageId)}
                    onTogglePrune={() => toggleImagePrune(img.imageId)}
                    onRecrop={!storyboardRunning ? () => handleRecropFromPage(img.imageId) : undefined}
                    onSegment={hasApiKey && !storyboardRunning ? () => handleSegment(img.imageId) : undefined}
                    segmenting={segmentingId === img.imageId}
                    cacheBust={cacheBust}
                  />
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Right: Raw text */}
      <div className="flex-1 min-w-0">
        {/* Metadata — processing indicator */}
        {metadataRunning && (
          <div className="mb-4 flex items-center gap-2 rounded border border-dashed p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <Trans>Processing metadata…</Trans>
          </div>
        )}

        {/* Fonts — distinct families the extractor found (positioned text). */}
        {page.fonts && page.fonts.length > 0 && (
          <div className="mb-4">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <Type className="h-3 w-3" />
              <Trans>Fonts ({String(page.fonts.length)})</Trans>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {page.fonts.map((f) => (
                <span
                  key={f.family}
                  className="inline-flex items-center gap-1.5 rounded border bg-muted/30 px-2 py-1 text-xs"
                  title={f.family}
                >
                  <span className="font-medium text-foreground">{f.family}</span>
                  {f.sizes.length > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {f.sizes.map((s) => `${s}px`).join(", ")}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reflowable books carry no positioned text — surface the detected
            serif/sans category and the base reading font it maps to. */}
        {(!page.fonts || page.fonts.length === 0) && page.fontProfile?.category && (
          <div className="mb-4">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <Type className="h-3 w-3" />
              <Trans>Detected Font</Trans>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex items-center rounded border bg-muted/30 px-2 py-1 font-medium text-foreground">
                {page.fontProfile.category === "sans" ? <Trans>Sans-serif</Trans> : <Trans>Serif</Trans>}
              </span>
              {reflowableFont && (
                <>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span
                    className="inline-flex items-center rounded border bg-muted/30 px-2 py-1 font-medium text-foreground"
                    title={reflowableFont.family}
                  >
                    {reflowableFont.family}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {page.text ? (
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <FileText className="h-3 w-3" />
              <Trans>Extracted Text</Trans>
            </h3>
            <div className="rounded border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono">
              {page.text}
            </div>
          </div>
        ) : page.extractionWarning ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800 uppercase tracking-wider mb-1">
              <AlertTriangle className="h-3 w-3" />
              <Trans>No text extracted</Trans>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              <Trans>
                This page's embedded text layer is empty, but the Sectioning step
                recovered text from the page image — so it looks like a scanned or
                image-only page. The pipeline can still work from the recovered
                text, but for better summaries, metadata, and translations, try to
                obtain a text-based version of this PDF (one with a real text
                layer) rather than a scanned copy.
              </Trans>
            </p>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-8 text-center">
            <Trans>No extracted text yet. Run the pipeline first.</Trans>
          </div>
        )}

      </div>
      </div>
      {cropTarget && cropPageSrc && (
        <ImageCropDialog
          imageSrc={cropPageSrc}
          onApply={handleCropApply}
          onClose={() => { setCropTarget(null); setCropPageSrc(null) }}
        />
      )}
      {segmentPreview && (
        <SegmentPreviewDialog
          imageSrc={segmentPreview.imageSrc}
          imageWidth={segmentPreview.imageWidth}
          imageHeight={segmentPreview.imageHeight}
          regions={segmentPreview.regions}
          onApply={handleSegmentApply}
          onClose={() => setSegmentPreview(null)}
        />
      )}
    </div>
  )
}
