import { useState, useEffect, useRef, useCallback } from "react"
import { Check, ChevronDown, Image as ImageIcon, Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { PageDetail, VersionEntry } from "@/api/client"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"
import { STAGE_DESCRIPTIONS } from "../stage-config"


type CaptioningData = NonNullable<PageDetail["imageCaptioning"]>

function VersionPicker({
  currentVersion,
  saving,
  dirty,
  bookLabel,
  itemId,
  onPreview,
  onSave,
  onDiscard,
}: {
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  bookLabel: string
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
    const res = await api.getVersionHistory(bookLabel, "image-captioning", itemId, true)
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
    return <Loader2 className="h-3 w-3 animate-spin" />
  }

  if (currentVersion == null) return null

  if (dirty) {
    return (
      <div className="flex items-center gap-1.5">
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
    <div ref={ref} className="relative">
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

function PageCaptions({ bookLabel, pageId, pageNumber, emptyState, largeImages }: { bookLabel: string; pageId: string; pageNumber: number; emptyState?: React.ReactNode; largeImages?: boolean }) {
  const queryClient = useQueryClient()
  const { data: page } = usePage(bookLabel, pageId)

  const [pending, setPending] = useState<CaptioningData | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset pending when page data changes
  useEffect(() => {
    setPending(null)
  }, [page?.versions.imageCaptioning])

  const effective = pending ?? page?.imageCaptioning
  const captions = effective?.captions ?? []
  const dirty = pending != null

  if (!page?.imageCaptioning || captions.length === 0) return emptyState ?? null

  const updateCaption = (imageId: string, newCaption: string) => {
    const base = pending ?? page.imageCaptioning
    if (!base) return
    setPending({
      ...base,
      captions: base.captions.map((c) =>
        c.imageId === imageId ? { ...c, caption: newCaption } : c
      ),
    })
  }

  const saveCaptions = async () => {
    if (!pending) return
    setSaving(true)
    const minDelay = new Promise((r) => setTimeout(r, 400))
    await api.updateImageCaptioning(bookLabel, pageId, pending)
    setPending(null)
    await queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages", pageId] })
    await minDelay
    setSaving(false)
  }

  const handlePreview = (data: unknown) => {
    setPending(data as CaptioningData)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-medium text-muted-foreground">Page {pageNumber}</span>
        <div className="ml-auto">
          <VersionPicker
            currentVersion={page.versions.imageCaptioning}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            itemId={pageId}
            onPreview={handlePreview}
            onSave={saveCaptions}
            onDiscard={() => setPending(null)}
          />
        </div>
      </div>
      {captions.map((cap) => (
        <div key={cap.imageId} className="flex items-start gap-4 rounded-md border bg-card overflow-hidden">
          <img
            src={`/api/books/${bookLabel}/images/${cap.imageId}`}
            alt={cap.caption}
            className={`shrink-0 self-stretch bg-muted object-cover block ${largeImages ? "w-96" : "w-48"}`}
          />
          <div className="flex-1 min-w-0 py-2.5 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-medium text-teal-600">{cap.imageId}</span>
            </div>
            <textarea
              value={cap.caption}
              onChange={(e) => updateCaption(cap.imageId, e.target.value)}
              className="w-full text-sm text-foreground leading-relaxed resize-none rounded border border-transparent bg-transparent p-1.5 -ml-1.5 hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              rows={2}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CaptionsView({ bookLabel, selectedPageId, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { data: pages, isLoading } = usePages(bookLabel)
  const { setExtra } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const captionsState = stageState("captions")
  const captionsDone = captionsState === "done"
  const captionsRunning = captionsState === "running" || captionsState === "queued"
  const showRunCard = !captionsDone || captionsRunning

  const handleRunCaptions = useCallback(() => {
    if (!hasApiKey || captionsRunning) return
    queueRun({ fromStage: "captions", toStage: "captions", apiKey })
  }, [hasApiKey, captionsRunning, apiKey, queueRun])

  const pagesWithImages = (pages ?? []).filter((p) => p.imageCount > 0)
  const hasCaptionData = pagesWithImages.some((p) => p.hasCaptioning)

  const displayPages = selectedPageId
    ? pagesWithImages.filter((p) => p.pageId === selectedPageId)
    : pagesWithImages
  const totalImages = displayPages.reduce((sum, p) => sum + p.imageCount, 0)

  useEffect(() => {
    if (!pages) return
    setExtra(
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{totalImages} images</span>
        <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{displayPages.length} pages</span>
      </div>
    )
    return () => setExtra(null)
  }, [pages, totalImages, displayPages.length, setExtra, selectedPageId])

  if (!showRunCard && isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Loading pages...</span>
      </div>
    )
  }

  if (showRunCard || pagesWithImages.length === 0 || !hasCaptionData) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="captions"
          description={STAGE_DESCRIPTIONS.captions}
          isRunning={captionsRunning}
          completed={captionsDone}
          onRun={handleRunCaptions}
          disabled={!hasApiKey || captionsRunning}
        />
      </div>
    )
  }

  if (selectedPageId && displayPages.length === 0 && pagesWithImages.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-3">
          <ImageIcon className="w-6 h-6 text-teal-300" />
        </div>
        <p className="text-sm font-medium">No images on this page</p>
        <button
          type="button"
          onClick={() => onSelectPage?.(null)}
          className="mt-3 text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors"
        >
          Show all images
        </button>
      </div>
    )
  }

  const singlePageEmptyState = selectedPageId ? (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-3">
        <ImageIcon className="w-6 h-6 text-teal-300" />
      </div>
      <p className="text-sm font-medium">No captions for this page</p>
      <p className="text-xs mt-1">This page has no captioned images</p>
    </div>
  ) : undefined

  return (
    <div className="space-y-4">
      {displayPages.map((page) => (
        <PageCaptions
          key={page.pageId}
          bookLabel={bookLabel}
          pageId={page.pageId}
          pageNumber={page.pageNumber}
          emptyState={singlePageEmptyState}
          largeImages={!!selectedPageId}
        />
      ))}
      {selectedPageId && (
        <div className="flex justify-center pt-2 pb-4">
          <button
            type="button"
            onClick={() => onSelectPage?.(null)}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors"
          >
            Show all images
          </button>
        </div>
      )}
    </div>
  )
}
