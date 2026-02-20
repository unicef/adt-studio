import { useState, useEffect, useRef } from "react"
import { Check, Eye, EyeOff, FileText, Image, ImageOff, Layers, Loader2, ChevronDown, X } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { usePage, usePageImage } from "@/hooks/use-pages"
import { api } from "@/api/client"
import type { VersionEntry } from "@/api/client"
import { useActiveConfig } from "@/hooks/use-debug"

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  node,
  itemId,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
  node: string
  itemId: string
  onPreview: (data: unknown) => void
  onSave: () => void
  onDiscard: () => void
}) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleOpen = async () => {
    if (saving || currentVersion == null) return
    setOpen(true)
    setLoading(true)
    const res = await api.getVersionHistory(bookLabel, node, itemId, true)
    setVersions(res.versions)
    setLoading(false)
  }

  const handlePick = (v: VersionEntry) => {
    if (v.version === currentVersion && !dirty) {
      setOpen(false)
      return
    }
    setOpen(false)
    onPreview(v.data)
  }

  if (saving) {
    return <Loader2 className="h-3 w-3 animate-spin ml-auto" />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDiscard}
          className="text-[10px] font-medium rounded px-2 py-0.5 bg-muted hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        onClick={handleOpen}
        className="flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal bg-muted hover:bg-muted/80 rounded px-1.5 py-0.5 transition-colors"
      >
        v{currentVersion}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-popover border rounded shadow-md min-w-[80px] py-1">
          {loading ? (
            <div className="flex items-center justify-center py-2 px-3">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            versions.map((v) => (
              <button
                key={v.version}
                type="button"
                onClick={() => handlePick(v)}
                className={`w-full text-left px-3 py-1 text-xs hover:bg-accent transition-colors ${
                  v.version === currentVersion ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                v{v.version}
              </button>
            ))
          ) : (
            <div className="px-3 py-1 text-xs text-muted-foreground">No versions</div>
          )}
        </div>
      )}
    </div>
  )
}

function ImageCard({ imageId, bookLabel, isPruned, reason, onTogglePrune }: { imageId: string; bookLabel: string; isPruned?: boolean; reason?: string; onTogglePrune?: () => void }) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null)

  return (
    <div
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] ${isPruned ? "opacity-40" : ""}`}
      title={isPruned ? `Pruned: ${reason}` : undefined}
    >
      <button
        type="button"
        onClick={onTogglePrune}
        className={`absolute top-1 right-1 z-10 flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-colors ${
          isPruned
            ? "bg-destructive hover:bg-destructive/80"
            : "bg-black/30 opacity-0 group-hover:opacity-100 hover:bg-black/50"
        }`}
        title={isPruned ? "Unprune image" : "Prune image"}
      >
        {isPruned
          ? <EyeOff className="h-3 w-3 text-white" />
          : <Eye className="h-3 w-3 text-white" />
        }
      </button>
      <img
        src={`/api/books/${bookLabel}/images/${imageId}`}
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

type TextClassData = NonNullable<import("@/api/client").PageDetail["textClassification"]>
type ImageClassData = NonNullable<import("@/api/client").PageDetail["imageClassification"]>

export function ExtractPageDetail({
  bookLabel,
  pageId,
}: {
  bookLabel: string
  pageId: string
}) {
  const { data: page, isLoading } = usePage(bookLabel, pageId)
  const { data: imageData } = usePageImage(bookLabel, pageId)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const configuredTextTypes = activeConfigData?.merged
    ? Object.keys((activeConfigData.merged as Record<string, unknown>).text_types as Record<string, string> ?? {})
    : []
  const [pageImageDims, setPageImageDims] = useState<{ w: number; h: number } | null>(null)
  const [savingText, setSavingText] = useState(false)
  const [savingImages, setSavingImages] = useState(false)
  const [pendingTextData, setPendingTextData] = useState<TextClassData | null>(null)
  const [pendingImageData, setPendingImageData] = useState<ImageClassData | null>(null)
  const queryClient = useQueryClient()

  // Clear pending state when page changes
  useEffect(() => {
    setPendingTextData(null)
    setPendingImageData(null)
  }, [pageId])

  // Effective data: pending if dirty, otherwise server
  const textClassData = pendingTextData ?? page?.textClassification ?? null
  const imageClassData = pendingImageData ?? page?.imageClassification ?? null
  const textDirty = pendingTextData != null
  const imageDirty = pendingImageData != null

  const updateTextField = (groupId: string, textIndex: number, field: "text" | "textType", value: string) => {
    const base = pendingTextData ?? page?.textClassification
    if (!base) return
    setPendingTextData({
      ...base,
      groups: base.groups.map((g) =>
        g.groupId === groupId
          ? { ...g, texts: g.texts.map((t, i) => (i === textIndex ? { ...t, [field]: value } : t)) }
          : g
      ),
    })
  }

  const toggleTextPrune = (groupId: string, textIndex: number) => {
    const base = pendingTextData ?? page?.textClassification
    if (!base) return
    setPendingTextData({
      ...base,
      groups: base.groups.map((g) =>
        g.groupId === groupId
          ? { ...g, texts: g.texts.map((t, i) => (i === textIndex ? { ...t, isPruned: !t.isPruned } : t)) }
          : g
      ),
    })
  }

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

  const saveTextChanges = async () => {
    if (!pendingTextData) return
    setSavingText(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateTextClassification(bookLabel, pageId, pendingTextData)
    setPendingTextData(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSavingText(false)
  }

  const saveImageChanges = async () => {
    if (!pendingImageData) return
    setSavingImages(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateImageClassification(bookLabel, pageId, pendingImageData)
    setPendingImageData(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSavingImages(false)
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading page...</div>
  }

  if (!page) return null

  return (
    <div className="flex gap-6 p-4">
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
              Extracted Images ({count})
              <VersionPicker
                currentVersion={page.versions.imageClassification}
                saving={savingImages}
                dirty={imageDirty}
                bookLabel={bookLabel}
                node="image-filtering"
                itemId={pageId}
                onPreview={(data) => setPendingImageData(data as ImageClassData)}
                onSave={saveImageChanges}
                onDiscard={() => setPendingImageData(null)}
              />
            </h3>
          )
        })()}

        {/* Page image */}
        {imageData ? (
          <div className="rounded border overflow-hidden shadow-sm">
            <img
              src={`data:image/png;base64,${imageData.imageBase64}`}
              alt={`Page ${page.pageNumber}`}
              className="w-full h-auto block"
              onLoad={(e) => {
                const img = e.target as HTMLImageElement
                setPageImageDims({ w: img.naturalWidth, h: img.naturalHeight })
              }}
            />
            <div className="px-2 py-1 flex items-center justify-between border-t bg-muted/30">
              <span className="text-[10px] text-muted-foreground truncate">{pageId}_page</span>
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
              No image available
            </div>
          </div>
        )}

        {/* Other extracted images (excluding the page image) */}
        {(() => {
          const pageImageId = `${pageId}_page`
          const extractedImages = imageClassData?.images.filter(
            (img) => img.imageId !== pageImageId
          ) ?? []
          if (extractedImages.length === 0) return null
          return (
            <div className="grid grid-cols-2 gap-2 items-start">
              {extractedImages.map((img) => (
                <div key={img.imageId} className="group">
                  <ImageCard imageId={img.imageId} bookLabel={bookLabel} isPruned={img.isPruned} reason={img.reason} onTogglePrune={() => toggleImagePrune(img.imageId)} />
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Right: Raw text */}
      <div className="flex-1 min-w-0">
        {page.text ? (
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <FileText className="h-3 w-3" />
              Extracted Text
            </h3>
            <div className="rounded border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono">
              {page.text}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No extracted text yet. Run the pipeline first.
          </div>
        )}

        {/* Classified text */}
        {textClassData && textClassData.groups.length > 0 && (
          <div className="mt-4">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              <Layers className="h-3 w-3" />
              Classified Text
              <VersionPicker
                currentVersion={page.versions.textClassification}
                saving={savingText}
                dirty={textDirty}
                bookLabel={bookLabel}
                node="text-classification"
                itemId={pageId}
                onPreview={(data) => setPendingTextData(data as TextClassData)}
                onSave={saveTextChanges}
                onDiscard={() => setPendingTextData(null)}
              />
            </h3>
            <div className="space-y-3">
              {textClassData.groups.map((group) => {
                const maxTypeLen = Math.max(...group.texts.map((t) => t.textType.length), 0)
                const colWidth = `${Math.max(maxTypeLen * 0.65 + 1.5, 4)}em`
                return (
                  <div key={group.groupId} className="rounded border overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.groupType}</span>
                    </div>
                    <div className="divide-y">
                      {group.texts.map((t, i) => (
                        <div key={i} className={`group/text px-3 py-1.5 flex items-start gap-2 text-sm ${t.isPruned ? "opacity-40" : ""}`}>
                          <select
                            value={t.textType}
                            onChange={(e) => updateTextField(group.groupId, i, "textType", e.target.value)}
                            className="shrink-0 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 text-center border-0 outline-none focus:ring-1 focus:ring-ring cursor-pointer appearance-none"
                            style={{ width: colWidth }}
                          >
                            {configuredTextTypes.includes(t.textType) ? null : (
                              <option value={t.textType}>{t.textType}</option>
                            )}
                            {configuredTextTypes.map((tt) => (
                              <option key={tt} value={tt}>{tt}</option>
                            ))}
                          </select>
                          <textarea
                            value={t.text}
                            onChange={(e) => updateTextField(group.groupId, i, "text", e.target.value)}
                            rows={1}
                            className="leading-relaxed flex-1 min-w-0 bg-transparent border-0 outline-none resize-none p-0 focus:ring-1 focus:ring-ring focus:rounded"
                            onInput={(e) => {
                              const el = e.target as HTMLTextAreaElement
                              el.style.height = "auto"
                              el.style.height = el.scrollHeight + "px"
                            }}
                            ref={(el) => {
                              if (el) {
                                el.style.height = "auto"
                                el.style.height = el.scrollHeight + "px"
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => toggleTextPrune(group.groupId, i)}
                            className={`shrink-0 self-center flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-colors ${
                              t.isPruned
                                ? "bg-destructive hover:bg-destructive/80"
                                : "opacity-0 group-hover/text:opacity-100 bg-black/30 hover:bg-black/50"
                            }`}
                            title={t.isPruned ? "Unprune text" : "Prune text"}
                          >
                            {t.isPruned
                              ? <EyeOff className="h-3 w-3 text-white" />
                              : <Eye className="h-3 w-3 text-white" />
                            }
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
