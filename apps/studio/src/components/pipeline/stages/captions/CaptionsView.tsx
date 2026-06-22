import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Image as ImageIcon, Search, X } from "lucide-react"
import { useQueries } from "@tanstack/react-query"
import { api } from "@/api/client"
import { usePages } from "@/hooks/use-pages"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { StageContentGuard } from "../../components/StageContentGuard"
import { StageEmptyState } from "../../components/StageEmptyState"
import { FilteredEmptyState } from "../../components/FilteredEmptyState"
import { useSectionNav } from "@/routes/books.$label"
import { useLingui } from "@lingui/react/macro"
import { CaptionsHintBanner } from "./components/CaptionsHintBanner"
import { PageCaptions } from "./components/PageCaptions"
import { PageJumper } from "./components/PageJumper"
import { matchesDecorativeFilter, matchesSearch } from "./lib/utils"
import type { DecorativeFilter, PageJumperEntry } from "./lib/types"

const TOOLBAR_HEIGHT = 64

export function CaptionsView({ bookLabel, selectedPageId, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { t } = useLingui()
  const { data: pages, isLoading } = usePages(bookLabel)
  const { setExtra } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const captionsState = stageState("captions")
  const captionsDone = captionsState === "done"
  const captionsRunning = captionsState === "running" || captionsState === "queued"
  const showRunCard = !captionsDone || captionsRunning
  const { sectionIndex, setSectionIndex } = useSectionNav()
  const [decorativeFilter, setDecorativeFilter] = useState<DecorativeFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [activePageId, setActivePageId] = useState<string | null>(null)

  const handleRunCaptions = useCallback(() => {
    if (!hasApiKey || captionsRunning) return
    queueRun({ fromStage: "captions", toStage: "captions", apiKey })
  }, [hasApiKey, captionsRunning, apiKey, queueRun])

  const pagesWithImages = useMemo(
    () => (pages ?? []).filter((p) => p.imageCount > 0),
    [pages],
  )
  const hasCaptionData = pagesWithImages.some((p) => p.hasCaptioning)

  const displayPages = useMemo(
    () =>
      selectedPageId
        ? pagesWithImages.filter((p) => p.pageId === selectedPageId)
        : pagesWithImages,
    [pagesWithImages, selectedPageId],
  )
  const totalImages = displayPages.reduce((sum, p) => sum + p.imageCount, 0)

  const selectedPageSummary = selectedPageId
    ? (pages ?? []).find((p) => p.pageId === selectedPageId)
    : null
  const hasSections = selectedPageSummary && selectedPageSummary.sectionCount > 1
  const filterSectionIndex = selectedPageId && hasSections ? sectionIndex : undefined

  const pageDetailQueries = useQueries({
    queries: displayPages.map((p) => ({
      queryKey: ["books", bookLabel, "pages", p.pageId],
      queryFn: () => api.getPage(bookLabel, p.pageId),
      enabled: !!bookLabel && hasCaptionData,
    })),
  })

  const pageImageQueries = useQueries({
    queries: displayPages.map((p) => ({
      queryKey: ["books", bookLabel, "pages", p.pageId, "image"],
      queryFn: () => api.getPageImage(bookLabel, p.pageId),
      enabled: !!bookLabel && hasCaptionData,
      staleTime: Infinity,
    })),
  })

  const aggregateCounts = useMemo(() => {
    let total = 0
    let captioned = 0
    let decorative = 0
    for (const q of pageDetailQueries) {
      const captions = q.data?.imageCaptioning?.captions ?? []
      for (const c of captions) {
        total += 1
        if (c.decorative === true) decorative += 1
        else captioned += 1
      }
    }
    return { total, captioned, decorative }
  }, [pageDetailQueries])

  // Total captions surviving the active decorative filter + search across every
  // displayed page. Drives the gallery-level "no results" state so filtering
  // down to nothing shows a single empty state instead of a blank gallery.
  const visibleCaptionTotal = useMemo(() => {
    let n = 0
    for (const q of pageDetailQueries) {
      for (const c of q.data?.imageCaptioning?.captions ?? []) {
        if (matchesDecorativeFilter(c, decorativeFilter) && matchesSearch(c, searchQuery)) n += 1
      }
    }
    return n
  }, [pageDetailQueries, decorativeFilter, searchQuery])
  const captionDetailsLoading = pageDetailQueries.some((q) => q.isLoading)
  const filtersActive = decorativeFilter !== "all" || searchQuery.trim().length > 0
  const showFilterEmpty =
    hasCaptionData && filtersActive && !captionDetailsLoading && visibleCaptionTotal === 0

  const pageJumperEntries: PageJumperEntry[] = useMemo(
    () =>
      displayPages.flatMap((p, idx) => {
        const query = pageDetailQueries[idx]
        const detail = query?.data
        const captions = detail?.imageCaptioning?.captions ?? []
        // The gallery only renders pages that have caption images, so the jumper
        // should match. Drop pages we've confirmed have none; keep ones still
        // loading so the list doesn't flash empty.
        if (query?.isSuccess && captions.length === 0) return []
        let decorativeCount = 0
        let captionedCount = 0
        for (const c of captions) {
          if (c.decorative === true) decorativeCount += 1
          else captionedCount += 1
        }
        const imgData = pageImageQueries[idx]?.data?.imageBase64
        return [
          {
            pageId: p.pageId,
            pageNumber: p.pageNumber,
            textPreview: p.textPreview,
            imageCount: p.imageCount,
            thumbnail: imgData ? `data:image/png;base64,${imgData}` : null,
            stats: detail?.imageCaptioning
              ? { total: captions.length, captioned: captionedCount, decorative: decorativeCount }
              : undefined,
          },
        ]
      }),
    [displayPages, pageDetailQueries, pageImageQueries],
  )

  useEffect(() => {
    if (!pages) return
    setExtra(
      <>
        {selectedPageSummary && (
          <>
            <span className="text-white/40 text-sm">/</span>
            <span className="text-sm font-medium">{t`Page ${String(selectedPageSummary.pageNumber)}`}</span>
            {hasSections && (
              <>
                <span className="text-white/40 text-sm">/</span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: selectedPageSummary.sectionCount }, (_, i) => {
                    const pruned = selectedPageSummary.prunedSections?.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSectionIndex(i)}
                        className={`flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[10px] font-medium transition-colors ${
                          i === sectionIndex
                            ? pruned ? "bg-white/20 text-white/50 line-through decoration-white/40" : "bg-white/30 text-white"
                            : pruned ? "bg-white/5 text-white/30 line-through decoration-white/20 hover:bg-white/10 hover:text-white/50" : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                        }`}
                        title={pruned ? t`Section ${String(i + 1)} (pruned)` : t`Section ${String(i + 1)}`}
                      >
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(totalImages)} images`}</span>
          <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">{t`${String(displayPages.length)} pages`}</span>
        </div>
      </>,
    )
    return () => setExtra(null)
  }, [pages, totalImages, displayPages.length, setExtra, selectedPageId, selectedPageSummary, hasSections, sectionIndex, setSectionIndex, t])

  useEffect(() => {
    const root = scrollContainerRef.current
    if (!root || displayPages.length === 0) return
    let frame = 0
    const computeActive = () => {
      frame = 0
      const sections = root.querySelectorAll<HTMLElement>("section[data-page-id]")
      if (sections.length === 0) return
      const rootTop = root.getBoundingClientRect().top
      const line = TOOLBAR_HEIGHT + 48
      let current = sections[0].dataset.pageId ?? null
      for (const section of sections) {
        if (section.getBoundingClientRect().top - rootTop <= line) {
          current = section.dataset.pageId ?? current
        } else {
          break
        }
      }
      if (current) setActivePageId(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(computeActive)
    }
    root.addEventListener("scroll", onScroll, { passive: true })
    computeActive()
    return () => {
      root.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [displayPages])

  const handleJumpToPage = useCallback((pageId: string) => {
    const root = scrollContainerRef.current
    if (!root) return
    const section = root.querySelector<HTMLElement>(`section[data-page-id="${pageId}"]`)
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const singlePageEmptyState = selectedPageId ? (
    <StageEmptyState
      icon={ImageIcon}
      color="teal"
      title={t`No captions for this page`}
      subtitle={t`This page has no captioned images`}
    />
  ) : undefined

  const chipBase =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-200 cursor-pointer"

  const hasNoImages = pagesWithImages.length === 0
  const showNoImagesEmpty =
    selectedPageId && displayPages.length === 0 && pagesWithImages.length > 0

  return (
    <StageContentGuard
      stageSlug="captions"
      isLoading={!showRunCard && isLoading}
      loadingLabel={t`Loading pages...`}
      showRunCard={!hasNoImages && (showRunCard || !hasCaptionData)}
      runCard={
        <StageRunCard
          stageSlug="captions"
          isRunning={captionsRunning}
          completed={captionsDone}
          onRun={handleRunCaptions}
          disabled={!hasApiKey || captionsRunning}
        />
      }
    >
      {hasNoImages ? (
        <StageEmptyState
          icon={ImageIcon}
          color="teal"
          title={t`No images in this book`}
          subtitle={t`This book has no images to caption`}
        />
      ) : showNoImagesEmpty ? (
        <StageEmptyState
          icon={ImageIcon}
          color="teal"
          title={t`No images on this page`}
          cta={
            <button
              type="button"
              onClick={() => onSelectPage?.(null)}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors"
            >
              {t`Show all`}
            </button>
          }
        />
      ) : (
    <div ref={scrollContainerRef} className="flex flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
      <CaptionsHintBanner />
      <div
        className="sticky top-0 z-20 flex items-center gap-3 px-6 py-3 bg-background/95 backdrop-blur-md border-b border-border/60"
        style={{ height: TOOLBAR_HEIGHT }}
      >
        <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/40 p-0.5">
          {([
            { value: "all", label: t`All`, count: aggregateCounts.total },
            { value: "captioned", label: t`Captioned`, count: aggregateCounts.captioned },
            { value: "decorative", label: t`Decorative`, count: aggregateCounts.decorative },
          ] as const).map((opt) => {
            const active = decorativeFilter === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDecorativeFilter(opt.value)}
                aria-pressed={active}
                className={`${chipBase} ${
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`tabular-nums text-[11px] ${
                    active
                      ? opt.value === "decorative"
                        ? "text-amber-600"
                        : "text-teal-700"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {opt.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t`Search captions or image IDs…`}
            className="w-full h-8 rounded-md border border-border/70 bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label={t`Clear search`}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {selectedPageId && (
            <button
              type="button"
              onClick={() => onSelectPage?.(null)}
              className="text-[12px] font-medium text-teal-600 hover:text-teal-700 hover:underline transition-colors"
            >
              {t`Show all pages`}
            </button>
          )}
          {!selectedPageId && pageJumperEntries.length > 1 && (
            <PageJumper
              pages={pageJumperEntries}
              activePageId={activePageId}
              onJump={handleJumpToPage}
            />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-8 px-4 pb-12 pt-3">
        {showFilterEmpty ? (
          <FilteredEmptyState
            icon={ImageIcon}
            color="teal"
            title={
              searchQuery.trim()
                ? t`No captions match your search`
                : t`No captions match these filters`
            }
            onClear={() => {
              setDecorativeFilter("all")
              setSearchQuery("")
            }}
            clearLabel={searchQuery.trim() ? t`Clear search` : t`Clear filters`}
          />
        ) : (
          displayPages.map((page) => (
            <PageCaptions
              key={page.pageId}
              bookLabel={bookLabel}
              pageId={page.pageId}
              pageNumber={page.pageNumber}
              textPreview={page.textPreview}
              emptyState={singlePageEmptyState}
              filterSectionIndex={page.pageId === selectedPageId ? filterSectionIndex : undefined}
              decorativeFilter={decorativeFilter}
              searchQuery={searchQuery}
              toolbarHeight={TOOLBAR_HEIGHT}
            />
          ))
        )}
      </div>
    </div>
      )}
    </StageContentGuard>
  )
}
