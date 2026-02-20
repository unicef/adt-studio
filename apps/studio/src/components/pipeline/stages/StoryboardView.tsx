import { useEffect, useState, useRef, useCallback } from "react"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../StepViewRouter"
import { useStageRun } from "@/hooks/use-stage-run"
import { useIsStageDone } from "@/hooks/use-stage-completion"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../StageRunCard"
import { STAGE_DESCRIPTIONS } from "../stage-config"
import { StoryboardSectionDetail } from "./StoryboardSectionDetail"


export function StoryboardView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const setSelectedPageId = onSelectPage ?? (() => {})
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { progress: stepProgress, queueRun } = useStageRun()
  const { apiKey, hasApiKey } = useApiKey()
  const storyboardState = stepProgress.steps.get("storyboard")?.state
  const storyboardDone = useIsStageDone(bookLabel, "storyboard")
  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const showRunCard = !storyboardDone || storyboardRunning

  const handleRunStoryboard = useCallback(() => {
    if (!hasApiKey || storyboardRunning) return
    queueRun({ fromStage: "storyboard", toStage: "storyboard", apiKey })
  }, [hasApiKey, storyboardRunning, apiKey, queueRun])

  const pageList = pages ?? []
  const [sectionIndex, setSectionIndex] = useState(0)
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
      setSectionIndex(0)
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

  // Reset section index when page changes externally
  useEffect(() => {
    if (!pendingLastSection.current) {
      setSectionIndex(0)
    }
  }, [selectedPageId])

  // Navigation elements for the purple header — passed to StoryboardSectionDetail
  // which controls the full header content (nav + version + AI + panel toggle)
  const navigationExtra = selectedPageSummary && sectionCount > 0 ? (
    <>
      <span className="text-white/40 text-sm">/</span>
      <span className="text-sm font-medium">
        Page {selectedPageSummary.pageNumber} / Section {sectionIndex + 1}
      </span>
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
          onRun={handleRunStoryboard}
          disabled={!hasApiKey || storyboardRunning}
        />
      </div>
    )
  }

  if (sectionCount === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        This page has no sections.
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
    />
  )
}
