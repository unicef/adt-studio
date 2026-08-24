import { useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageOff,
  Info,
  LayoutGrid,
  Loader2,
  TriangleAlert,
  Type,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { resolveReflowableFont } from "@adt/types"
import { cn } from "@/lib/utils"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { useActiveConfig } from "@/hooks/use-debug"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import {
  ImageCropDialog,
  pageBoundsToCropRect,
} from "@/components/pipeline/stages/storyboard/components/ImageCropDialog"
import { SegmentPreviewDialog } from "@/components/pipeline/stages/storyboard/components/SegmentPreviewDialog"
import { SaveError, StepBody } from "../shared/ui"
import { ExtractImageGrid } from "./ExtractImageGrid"
import { useExtractImages } from "./useExtractImages"

function DetailNavButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  children,
}: {
  icon: typeof ChevronLeft
  label: string
  onClick: () => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium text-foreground",
        "transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

export function ExtractPageDetail({
  label,
  pageId,
  accent,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  accent: string
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const { data: page, isLoading } = usePage(label, pageId)
  const { data: imageData } = usePageImage(label, pageId)
  const { data: activeConfigData } = useActiveConfig(label)
  const { hasApiKey } = useApiKey()
  const { stageState, stepState } = useBookRun()
  const nav = usePipelineNavigation(label)
  const [pageImageDims, setPageImageDims] = useState<{ w: number; h: number } | null>(null)

  const storyboardState = stageState("storyboard")
  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const storyboardDone = storyboardState === "done"
  const metadataRunning = stepState("metadata") === "running"
  const imageFilterRunning = stepState("image-filtering") === "running"

  const images = useExtractImages(label, pageId, page, storyboardRunning)

  const pageSrc = imageData?.imageBase64 ? `data:image/png;base64,${imageData.imageBase64}` : null

  const boundsByImageId = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const meta of page?.imagesMeta ?? []) {
      if (meta.bounds) map.set(meta.imageId, meta.bounds)
    }
    return map
  }, [page?.imagesMeta])

  const pageImageName = `${pageId}_page`
  const pageImageMeta = useMemo(
    () => page?.imagesMeta.find((meta) => meta.imageId === pageImageName),
    [page?.imagesMeta, pageImageName],
  )
  const pageDims =
    pageImageMeta?.width && pageImageMeta.height
      ? { w: pageImageMeta.width, h: pageImageMeta.height }
      : pageImageDims

  const reflowableFont = page?.fontProfile?.category
    ? resolveReflowableFont(
        (activeConfigData as { reflowable_font?: string } | undefined)?.reflowable_font,
        page.fontProfile.category,
      )
    : null

  const title = page ? <Trans>Page {page.pageNumber}</Trans> : <Trans>Page</Trans>

  return (
    <StepBody
      title={title}
      meta={pageId}
      actions={
        <>
          <DetailNavButton
            icon={ChevronLeft}
            label={t`Previous page`}
            onClick={() => prevPageId && onStep(prevPageId)}
            disabled={!prevPageId}
          />
          <DetailNavButton
            icon={ChevronRight}
            label={t`Next page`}
            onClick={() => nextPageId && onStep(nextPageId)}
            disabled={!nextPageId}
          />
          <DetailNavButton icon={Info} label={t`Book info`} onClick={nav.openBookInfo}>
            <Trans>Book info</Trans>
          </DetailNavButton>
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      {isLoading || !page ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <Trans>Loading page…</Trans>
        </div>
      ) : (
        <>
          {storyboardDone && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <TriangleAlert className="size-3.5 shrink-0" />
              <Trans>
                Storyboard has already been run. Changes made here will not take effect until
                storyboard is re-run.
              </Trans>
            </div>
          )}

          <SaveError error={images.save.error} />
          <SaveError error={images.recrop.error} />

          <div className="flex gap-6">
            <div className="flex w-[45%] shrink-0 flex-col gap-4">
              <ExtractImageGrid
                label={label}
                pageId={pageId}
                page={page}
                images={images}
                hasPageImage={!!pageSrc}
                storyboardRunning={storyboardRunning}
                imageFilterRunning={imageFilterRunning}
                hasApiKey={hasApiKey}
                canRecrop={!!pageSrc}
              >
                {pageSrc ? (
                  <div className="overflow-hidden rounded-lg border shadow-sm">
                    <img
                      src={pageSrc}
                      alt={t`Page ${String(page.pageNumber)}`}
                      className="block h-auto w-full"
                      onLoad={
                        pageImageMeta?.width && pageImageMeta.height
                          ? undefined
                          : (e) => {
                              const img = e.currentTarget
                              setPageImageDims({ w: img.naturalWidth, h: img.naturalHeight })
                            }
                      }
                    />
                    <div className="flex items-center justify-between border-t bg-muted/30 px-2 py-1">
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {pageImageName}
                      </span>
                      {pageDims && (
                        <span className="ml-1 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {pageDims.w}&times;{pageDims.h}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg border bg-muted/50 text-[12.5px] text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <ImageOff className="size-6" />
                      <Trans>No image available</Trans>
                    </div>
                  </div>
                )}
              </ExtractImageGrid>
            </div>

            <div className="min-w-0 flex-1">
              {metadataRunning && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
                  <Trans>Processing metadata…</Trans>
                </div>
              )}

              {page.fonts && page.fonts.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Type className="size-3" />
                    <Trans>Fonts ({String(page.fonts.length)})</Trans>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {page.fonts.map((font) => (
                      <span
                        key={font.family}
                        className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-[12px]"
                        title={font.family}
                      >
                        <span className="font-medium text-foreground">{font.family}</span>
                        {font.sizes.length > 0 && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {font.sizes.map((size) => `${size}px`).join(", ")}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(!page.fonts || page.fonts.length === 0) && page.fontProfile?.category && (
                <div className="mb-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Type className="size-3" />
                    <Trans>Detected Font</Trans>
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="inline-flex items-center rounded-md border bg-muted/30 px-2 py-1 font-medium text-foreground">
                      {page.fontProfile.category === "sans" ? (
                        <Trans>Sans-serif</Trans>
                      ) : (
                        <Trans>Serif</Trans>
                      )}
                    </span>
                    {reflowableFont && (
                      <>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span
                          className="inline-flex items-center rounded-md border bg-muted/30 px-2 py-1 font-medium text-foreground"
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
                  <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <FileText className="size-3" />
                    <Trans>Extracted Text</Trans>
                  </h3>
                  <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-[12px] leading-relaxed">
                    {page.text}
                  </div>
                </div>
              ) : page.extractionWarning ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="size-3" />
                    <Trans>No text extracted</Trans>
                  </div>
                  <p className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
                    <Trans>
                      This page's embedded text layer is empty, but the Sectioning step recovered
                      text from the page image — so it looks like a scanned or image-only page. The
                      pipeline can still work from the recovered text, but for better summaries,
                      metadata, and translations, try to obtain a text-based version of this PDF
                      (one with a real text layer) rather than a scanned copy.
                    </Trans>
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-[12.5px] text-muted-foreground">
                  <Trans>No extracted text yet. Run the pipeline first.</Trans>
                </div>
              )}
            </div>
          </div>

          {images.cropTargetId && pageSrc && (
            <ImageCropDialog
              imageSrc={pageSrc}
              initialRect={(() => {
                const bounds = boundsByImageId.get(images.cropTargetId)
                return bounds ? pageBoundsToCropRect(bounds) : undefined
              })()}
              onApply={async (blob) => {
                await images.recrop.mutateAsync({ imageId: images.cropTargetId ?? "", blob })
              }}
              onClose={images.closeCrop}
            />
          )}

          {images.segmentPreview && (
            <SegmentPreviewDialog
              imageSrc={images.segmentPreview.imageSrc}
              imageWidth={images.segmentPreview.imageWidth}
              imageHeight={images.segmentPreview.imageHeight}
              regions={images.segmentPreview.regions}
              onApply={(regions) =>
                images.applySegmentation.mutateAsync({
                  imageId: images.segmentPreview?.imageId ?? "",
                  regions,
                })
              }
              onClose={images.closeSegmentPreview}
            />
          )}
        </>
      )}
    </StepBody>
  )
}
