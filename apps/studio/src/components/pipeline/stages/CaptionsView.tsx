import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Check, ChevronDown, Image as ImageIcon, Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api, BASE_URL } from "@/api/client"
import type { PageDetail, VersionEntry } from "@/api/client"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"
import { STAGE_DESCRIPTIONS } from "../stage-config"
import { useSectionNav } from "@/routes/books.$label"


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

/** Build a map from imageId → sectionIndex using sectioning data */
function buildImageSectionMap(page: PageDetail | undefined): Map<string, number> {
  const map = new Map<string, number>()
  if (!page?.sectioning) return map
  page.sectioning.sections.forEach((section, idx) => {
    for (const part of section.parts) {
      if (part.type === "image") {
        map.set(part.imageId, idx)
      }
    }
  })
  return map
}

interface CaptionGroup {
  sectionIndex: number
  sectionType?: string
  captions: Array<{ imageId: string; reasoning: string; caption: string }>
}

function PageCaptions({
  bookLabel,
  pageId,
  pageNumber,
  emptyState,
  largeImages,
  filterSectionIndex,
}: {
  bookLabel: string
  pageId: string
  pageNumber: number
  emptyState?: React.ReactNode
  largeImages?: boolean
  filterSectionIndex?: number
}) {
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

  // Map imageId → sectionIndex
  const imageSectionMap = useMemo(() => buildImageSectionMap(page), [page?.sectioning])

  // Group captions by section
  const groups = useMemo(() => {
    const sections = page?.sectioning?.sections
    if (!sections || sections.length <= 1) {
      // No sectioning or single section — flat list, no grouping
      return null
    }
    const grouped = new Map<number, CaptionGroup>()
    const unsectioned: Array<{ imageId: string; reasoning: string; caption: string }> = []
    for (const cap of captions) {
      const si = imageSectionMap.get(cap.imageId)
      if (si != null) {
        let group = grouped.get(si)
        if (!group) {
          group = {
            sectionIndex: si,
            sectionType: sections[si]?.sectionType,
            captions: [],
          }
          grouped.set(si, group)
        }
        group.captions.push(cap)
      } else {
        unsectioned.push(cap)
      }
    }
    // Sort by section index
    const result = Array.from(grouped.values()).sort((a, b) => a.sectionIndex - b.sectionIndex)
    if (unsectioned.length > 0) {
      result.push({ sectionIndex: -1, sectionType: undefined, captions: unsectioned })
    }
    return result
  }, [captions, imageSectionMap, page?.sectioning?.sections])

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

  // Filter captions by section when a section is selected
  const filteredCaptions = filterSectionIndex != null
    ? captions.filter((cap) => imageSectionMap.get(cap.imageId) === filterSectionIndex)
    : captions

  if (filterSectionIndex != null && filteredCaptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-3">
          <ImageIcon className="w-6 h-6 text-teal-300" />
        </div>
        <p className="text-sm font-medium">No images in this section</p>
      </div>
    )
  }

  const renderCaption = (cap: { imageId: string; reasoning: string; caption: string }) => (
    <div key={cap.imageId} className="flex items-start gap-4 rounded-md border bg-card overflow-hidden">
      <img
        src={`${BASE_URL}/books/${bookLabel}/images/${cap.imageId}`}
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
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-medium text-foreground">
          Page {pageNumber}
          {filterSectionIndex != null && (
            <span className="text-muted-foreground"> / Section {filterSectionIndex + 1}</span>
          )}
        </span>
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
      {filterSectionIndex != null ? (
        // Filtered to a specific section — flat list
        filteredCaptions.map(renderCaption)
      ) : groups ? (
        // Grouped by section
        groups.map((group) => (
          <div key={group.sectionIndex}>
            <div className="px-1 pt-1.5 pb-0.5">
              <span className="text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                {group.sectionIndex >= 0
                  ? `Section ${group.sectionIndex + 1}${group.sectionType ? ` — ${group.sectionType}` : ""}`
                  : "Other images"
                }
              </span>
            </div>
            {group.captions.map(renderCaption)}
          </div>
        ))
      ) : (
        // Single section or no sectioning — flat list
        filteredCaptions.map(renderCaption)
      )}
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
  const { sectionIndex, setSectionIndex } = useSectionNav()

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

  // Determine if we should filter by section (only when a specific page is selected and it has sections)
  const selectedPageSummary = selectedPageId
    ? (pages ?? []).find((p) => p.pageId === selectedPageId)
    : null
  const hasSections = selectedPageSummary && selectedPageSummary.sectionCount > 1
  const filterSectionIndex = selectedPageId && hasSections
    ? sectionIndex
    : undefined

  useEffect(() => {
    if (!pages) return
    setExtra(
      <>
        {selectedPageSummary && (
          <>
            <span className="text-white/40 text-sm">/</span>
            <span className="text-sm font-medium">Page {selectedPageSummary.pageNumber}</span>
            {hasSections && (
              <>
                <span className="text-white/40 text-sm">/</span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: selectedPageSummary.sectionCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSectionIndex(i)}
                      className={`flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[10px] font-medium transition-colors ${
                        i === sectionIndex
                          ? "bg-white/30 text-white"
                          : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                      }`}
                      title={`Section ${i + 1}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{totalImages} images</span>
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{displayPages.length} pages</span>
        </div>
      </>
    )
    return () => setExtra(null)
  }, [pages, totalImages, displayPages.length, setExtra, selectedPageId, selectedPageSummary?.pageNumber, selectedPageSummary?.sectionCount, hasSections, sectionIndex, setSectionIndex])

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
          Show all
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
      {selectedPageId && (
        <div className="flex justify-end px-4 pt-3">
          <button
            type="button"
            onClick={() => onSelectPage?.(null)}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors"
          >
            Show all
          </button>
        </div>
      )}
      {displayPages.map((page) => (
        <PageCaptions
          key={page.pageId}
          bookLabel={bookLabel}
          pageId={page.pageId}
          pageNumber={page.pageNumber}
          emptyState={singlePageEmptyState}
          largeImages={!!selectedPageId}
          filterSectionIndex={page.pageId === selectedPageId ? filterSectionIndex : undefined}
        />
      ))}
    </div>
  )
}
