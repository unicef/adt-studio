import { useEffect, useRef, useCallback } from "react"
import { ArrowLeft, ArrowRight, LayoutGrid, Loader2 } from "lucide-react"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"
import { STAGE_DESCRIPTIONS } from "../stage-config"
import { StoryboardSectionDetail } from "./StoryboardSectionDetail"
import { useSectionNav } from "@/routes/books.$label"


export function StoryboardView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const setSelectedPageId = onSelectPage ?? (() => {})
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const storyboardState = stageState("storyboard")
  const storyboardDone = storyboardState === "done"
  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const showRunCard = !storyboardDone || storyboardRunning

  const handleRunStoryboard = useCallback(() => {
    if (!hasApiKey || storyboardRunning) return
    queueRun({ fromStage: "storyboard", toStage: "storyboard", apiKey })
  }, [hasApiKey, storyboardRunning, apiKey, queueRun])

  const pageList = pages ?? []
  const { sectionIndex, setSectionIndex, skipNextResetRef } = useSectionNav()
  // When navigating backward across page boundary, resolve to last section
  const pendingLastSection = useRef(false)
  // Guard: prevent silent navigation while AI image is generating
  const isGeneratingRef = useRef(false)
  const handleGeneratingChange = useCallback((g: boolean) => { isGeneratingRef.current = g }, [])

  // Auto-select first page when no page is selected
  useEffect(() => {
    if (showRunCard) return
    if (!selectedPageIdProp && pageList.length > 0) {
      setSelectedPageId(pageList[0].pageId)
    }
  }, [selectedPageIdProp, pageList.length, showRunCard, setSelectedPageId])

  const selectedPageId = selectedPageIdProp ?? null
  const currentPageIndex = selectedPageId ? pageList.findIndex((p) => p.pageId === selectedPageId) : -1
  const selectedPageSummary = currentPageIndex >= 0 ? pageList[currentPageIndex] : null
  const prevPageId = currentPageIndex > 0 ? pageList[currentPageIndex - 1].pageId : null
  const nextPageId = currentPageIndex < pageList.length - 1 ? pageList[currentPageIndex + 1].pageId : null

  const { data: page, isLoading: pageLoading } = usePage(bookLabel, selectedPageId ?? "")

  const sectionCount = page?.sectioning?.sections.length ?? 0

  // Resolve pending "last section" once page data loads
  useEffect(() => {
    if (pendingLastSection.current && sectionCount > 0) {
      setSectionIndex(sectionCount - 1)
      pendingLastSection.current = false
    }
  }, [sectionCount])

  // Clamp section index when data changes
  useEffect(() => {
    if (sectionCount > 0 && sectionIndex >= sectionCount && !pendingLastSection.current) {
      setSectionIndex(sectionCount - 1)
    }
  }, [sectionCount, sectionIndex])

  // Navigation
  const canGoPrev = sectionIndex > 0 || !!prevPageId
  const canGoNext = sectionIndex < sectionCount - 1 || !!nextPageId

  const goPrev = () => {
    if (isGeneratingRef.current && !window.confirm("An AI image is being generated. Cancel it and navigate?")) return
    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1)
    } else if (prevPageId) {
      pendingLastSection.current = true
      skipNextResetRef.current = true
      setSelectedPageId(prevPageId)
    }
  }

  const goNext = () => {
    if (isGeneratingRef.current && !window.confirm("An AI image is being generated. Cancel it and navigate?")) return
    if (sectionIndex < sectionCount - 1) {
      setSectionIndex(sectionIndex + 1)
    } else if (nextPageId) {
      setSectionIndex(0)
      setSelectedPageId(nextPageId)
    }
  }

  // Navigation elements for the purple header — passed to StoryboardSectionDetail
  // which controls the full header content (nav + version + AI + panel toggle)
  const navigationExtra = selectedPageSummary && sectionCount > 0 ? (
    <>
      <span className="text-white/40 text-sm">/</span>
      <span className="text-sm font-medium">
        Page {selectedPageSummary.pageNumber}
      </span>
      <span className="text-white/40 text-sm">/</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: sectionCount }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (isGeneratingRef.current && !window.confirm("An AI image is being generated. Cancel it and navigate?")) return
              setSectionIndex(i)
            }}
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
  ) : null

  const navigationArrows = (
    <div className="flex gap-1">
      <button
        type="button"
        className="flex items-center justify-center w-7 h-7 rounded bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-default"
        disabled={!canGoPrev}
        onClick={goPrev}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="flex items-center justify-center w-7 h-7 rounded bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-default"
        disabled={!canGoNext}
        onClick={goNext}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )

  // Header: for non-section views (no sectioning data, or loading states)
  useEffect(() => {
    if (showRunCard) {
      setOnLabelClick(null)
      setExtra(null)
      return () => {
        setExtra(null)
        setOnLabelClick(null)
      }
    }

    // When StoryboardSectionDetail is rendered, it manages the header itself
    if (page?.sectioning && sectionCount > 0) return

    if (selectedPageSummary) {
      setOnLabelClick(null)
      setExtra(
        <>
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">Page {selectedPageSummary.pageNumber}</span>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-default"
              disabled={!prevPageId}
              onClick={() => prevPageId && setSelectedPageId(prevPageId)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex items-center justify-center w-7 h-7 rounded bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-30 disabled:cursor-default"
              disabled={!nextPageId}
              onClick={() => nextPageId && setSelectedPageId(nextPageId)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )
    } else {
      setOnLabelClick(null)
      setExtra(null)
    }
    return () => {
      setExtra(null)
      setOnLabelClick(null)
    }
  }, [selectedPageId, selectedPageSummary?.pageNumber, sectionIndex, sectionCount, canGoPrev, canGoNext, prevPageId, nextPageId, setExtra, setOnLabelClick, page?.sectioning, showRunCard])

  // Keyboard arrow navigation
  useEffect(() => {
    if (!selectedPageId || showRunCard) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canGoPrev) {
        goPrev()
      } else if (e.key === "ArrowRight" && canGoNext) {
        goNext()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedPageId, sectionIndex, sectionCount, canGoPrev, canGoNext, prevPageId, nextPageId, showRunCard])

  if (showRunCard) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="storyboard"
          description={STAGE_DESCRIPTIONS.storyboard}
          isRunning={storyboardRunning}
          completed={storyboardDone}
          onRun={handleRunStoryboard}
          disabled={!hasApiKey || storyboardRunning}
        />
      </div>
    )
  }

  if (pagesLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pages...
      </div>
    )
  }

  if (pageList.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No pages extracted yet. Run the pipeline to extract content.
        </p>
      </div>
    )
  }

  if (pageLoading || !page) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading page...
      </div>
    )
  }

  if (!page.sectioning) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="storyboard"
          description={STAGE_DESCRIPTIONS.storyboard}
          isRunning={storyboardRunning}
          completed={storyboardDone}
          onRun={handleRunStoryboard}
          disabled={!hasApiKey || storyboardRunning}
        />
      </div>
    )
  }

  if (sectionCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center mb-3">
          <LayoutGrid className="w-6 h-6 text-violet-300" />
        </div>
        <p className="text-sm font-medium">No sections for this page</p>
        <p className="text-xs mt-1">This page has no storyboard sections</p>
      </div>
    )
  }

  return (
    <StoryboardSectionDetail
      bookLabel={bookLabel}
      pageId={selectedPageId!}
      sectionIndex={sectionIndex}
      page={page}
      navigationExtra={navigationExtra}
      navigationArrows={navigationArrows}
      onGeneratingChange={handleGeneratingChange}
      onNavigateSection={setSectionIndex}
    />
  )
}
