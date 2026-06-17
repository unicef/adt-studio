import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { AlertTriangle, Check, Crop, Eye, EyeOff, FileText, Image, ImageOff, Layers, Loader2, ChevronDown, Square, Type, X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { api, BASE_URL } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"
import { useBookRun } from "@/hooks/use-book-run"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { ImageCropDialog } from "@/components/pipeline/stages/storyboard/components/ImageCropDialog"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { usePendingChanges } from "@/components/pipeline/components/change-summary"
import { resolveReflowableFont } from "@adt/types"

function ImageCard({ imageId, bookLabel, isPruned, reason, bounds, onTogglePrune, onRecrop, cacheBust }: { imageId: string; bookLabel: string; isPruned?: boolean; reason?: string; bounds?: { x: number; y: number; width: number; height: number }; onTogglePrune?: () => void; onRecrop?: () => void; cacheBust?: number }) {
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
  const queryClient = useQueryClient()

  // Clear pending state when page changes
  useEffect(() => {
    setPendingImageData(null)
    setCropTarget(null)
    setCropPageSrc(null)
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
    </div>
  )
}
