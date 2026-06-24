import { useEffect, useRef, useCallback, useState } from "react"
import { ArrowLeft, ArrowRight, LayoutGrid, Table2 } from "lucide-react"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { LoadingState } from "../../components/LoadingState"
import { StageEmptyState } from "../../components/StageEmptyState"
import { StoryboardSectionDetail } from "./components/StoryboardSectionDetail"
import { StoryboardQuizDetail } from "./components/StoryboardQuizDetail"
import { SectioningOverview } from "./components/SectioningOverview"
import { useSectionNav } from "@/routes/books.$label"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"


export function StoryboardView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { t } = useLingui()
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const setSelectedPageId = onSelectPage ?? (() => {})
  const [overviewMode, setOverviewMode] = useState(false)
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const storyboardState = stageState("storyboard")
  const storyboardDone = storyboardState === "done"
  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const sectioningReady = stageState("sectioning") === "done"
  // Show page content during a run (or after an error) once pages have data.
  // Keyed on sectioning (which a render-only re-run preserves) so the view drops
  // into the per-page storyboard view during a re-run — there each section shows
  // its own "Rendering this section…" loading state while web-rendering
  // regenerates (the page's stale rendering is cleared optimistically on re-run,
  // see queueRun). Only show the run card when idle or no data exists yet.
  const hasPageData = (pages ?? []).some((p) => p.sectionCount > 0)
  const showRunCard = storyboardRunning || storyboardState === "error"
    ? !hasPageData
    : !storyboardDone

  const handleRunStoryboard = useCallback(() => {
    if (!hasApiKey || !sectioningReady || storyboardRunning) return
    queueRun({ fromStage: "storyboard", toStage: "storyboard", apiKey })
  }, [hasApiKey, sectioningReady, storyboardRunning, apiKey, queueRun])

  const pageList = pages ?? []
  const { sectionIndex, setSectionIndex, skipNextResetRef } = useSectionNav()
  // When navigating backward across page boundary, resolve to last section
  const pendingLastSection = useRef(false)
  // Guard: prevent silent navigation while AI image is generating
  const isGeneratingRef = useRef(false)
  const handleGeneratingChange = useCallback((g: boolean) => { isGeneratingRef.current = g }, [])

  // Quizzes appear in the sidebar with a synthetic pageId of `quiz-{index}`.
  // When that pageId is in the URL we render the quiz panel instead of loading
  // page detail — calling usePage with a fake id would 404.
  const quizMatch = selectedPageIdProp?.match(/^quiz-(\d+)$/)
  const selectedQuizIndex = quizMatch ? parseInt(quizMatch[1], 10) : null
  const isQuizRoute = selectedQuizIndex != null

  // Auto-select first page when no page is selected
  useEffect(() => {
    if (showRunCard) return
    if (!selectedPageIdProp && pageList.length > 0) {
      setSelectedPageId(pageList[0].pageId)
    }
  }, [selectedPageIdProp, pageList.length, showRunCard, setSelectedPageId])

  const selectedPageId = selectedPageIdProp ?? null
  const currentPageIndex =
    selectedPageId && !isQuizRoute
      ? pageList.findIndex((p) => p.pageId === selectedPageId)
      : -1
  const selectedPageSummary = currentPageIndex >= 0 ? pageList[currentPageIndex] : null
  const prevPageId = currentPageIndex > 0 ? pageList[currentPageIndex - 1].pageId : null
  const nextPageId = currentPageIndex < pageList.length - 1 ? pageList[currentPageIndex + 1].pageId : null

  const { data: page, isLoading: pageLoading } = usePage(
    bookLabel,
    !isQuizRoute && selectedPageId ? selectedPageId : "",
  )

  const sectionCount = page?.sectioningTree?.sections.length ?? 0

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
    if (isGeneratingRef.current && !window.confirm(t`An AI image is being generated. Cancel it and navigate?`)) return
    if (sectionIndex > 0) {
      setSectionIndex(sectionIndex - 1)
    } else if (prevPageId) {
      pendingLastSection.current = true
      skipNextResetRef.current = true
      setSelectedPageId(prevPageId)
    }
  }

  const goNext = () => {
    if (isGeneratingRef.current && !window.confirm(t`An AI image is being generated. Cancel it and navigate?`)) return
    if (sectionIndex < sectionCount - 1) {
      setSectionIndex(sectionIndex + 1)
    } else if (nextPageId) {
      setSectionIndex(0)
      setSelectedPageId(nextPageId)
    }
  }

  // Navigation elements for the purple header — passed to StoryboardSectionDetail
  // which controls the full header content (nav + version + AI + panel toggle)
  const currentSection = page?.sectioningTree?.sections[sectionIndex]
  const navigationExtra = selectedPageSummary && sectionCount > 0 ? (
    <>
      <span className="text-white/40 text-sm">/</span>
      <span className="text-sm font-medium">
        {t`Page ${String(selectedPageSummary.pageNumber)}`}
      </span>
      <span className="text-white/40 text-sm">/</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: sectionCount }, (_, i) => {
          const section = page?.sectioningTree?.sections[i]
          const pruned = section?.isPruned
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (isGeneratingRef.current && !window.confirm(t`An AI image is being generated. Cancel it and navigate?`)) return
                setSectionIndex(i)
              }}
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
  ) : null

  // Overview toggle button (reused in multiple header states)
  const overviewToggle = (
    <button
      type="button"
      className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
        overviewMode ? "bg-white/30 text-white" : "bg-white/15 hover:bg-white/25 text-white/70"
      }`}
      onClick={() => setOverviewMode((v) => !v)}
      title={t`Overview`}
    >
      <Table2 className="h-3.5 w-3.5" />
    </button>
  )

  const navigationArrows = (
    <div className="flex gap-1">
      {overviewToggle}
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

    // Overview mode: show overview header
    if (overviewMode) {
      setOnLabelClick(null)
      setExtra(
        <>
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">{t`Overview`}</span>
          <div className="ml-auto flex gap-1">
            {overviewToggle}
          </div>
        </>
      )
      return () => {
        setExtra(null)
        setOnLabelClick(null)
      }
    }

    // When StoryboardSectionDetail or StoryboardQuizDetail is rendered, those
    // components manage the header themselves.
    if (isQuizRoute) return
    if (page?.sectioningTree && sectionCount > 0) return

    if (selectedPageSummary) {
      setOnLabelClick(null)
      setExtra(
        <>
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">{t`Page ${String(selectedPageSummary.pageNumber)}`}</span>
          <div className="ml-auto flex gap-1">
            {overviewToggle}
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
  }, [selectedPageId, selectedPageSummary?.pageNumber, sectionIndex, sectionCount, canGoPrev, canGoNext, prevPageId, nextPageId, setExtra, setOnLabelClick, page?.sectioningTree, showRunCard, overviewMode, isQuizRoute])

  // Keyboard arrow navigation
  useEffect(() => {
    if (!selectedPageId || showRunCard) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack arrows when user is typing in an input, textarea, or contenteditable
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
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
          isRunning={storyboardRunning}
          completed={storyboardDone}
          onRun={handleRunStoryboard}
          disabled={!hasApiKey || !sectioningReady || storyboardRunning}
        />
      </div>
    )
  }

  if (pagesLoading) {
    return <LoadingState stageSlug="storyboard" label={<Trans>Loading pages...</Trans>} />
  }

  if (pageList.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          <Trans>No pages extracted yet. Run the pipeline to extract content.</Trans>
        </p>
      </div>
    )
  }

  // Overview mode: show sectioning table for all pages
  if (overviewMode) {
    return (
      <SectioningOverview
        bookLabel={bookLabel}
        pages={pageList}
        onNavigateToSection={(pageId, sectionIdx) => {
          setOverviewMode(false)
          setSelectedPageId(pageId)
          setSectionIndex(sectionIdx)
        }}
      />
    )
  }

  // Quiz route: pseudo-pageId is `quiz-{index}`. Render the quiz panel.
  if (isQuizRoute && selectedQuizIndex != null) {
    return (
      <StoryboardQuizDetail
        bookLabel={bookLabel}
        quizIndex={selectedQuizIndex}
        navigationArrows={
          <div className="flex gap-1">{overviewToggle}</div>
        }
      />
    )
  }

  if (pageLoading || !page) {
    return <LoadingState stageSlug="storyboard" label={<Trans>Loading page...</Trans>} />
  }

  if (!page.sectioningTree) {
    if (storyboardRunning) {
      return <LoadingState stageSlug="storyboard" label={<Trans>Waiting for page to be processed...</Trans>} />
    }
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="storyboard"
          isRunning={storyboardRunning}
          completed={storyboardDone}
          onRun={handleRunStoryboard}
          disabled={!hasApiKey || !sectioningReady || storyboardRunning}
        />
      </div>
    )
  }

  if (sectionCount === 0) {
    return (
      <StageEmptyState
        icon={LayoutGrid}
        color="violet"
        title={<Trans>No sections for this page</Trans>}
        subtitle={<Trans>This page has no storyboard sections</Trans>}
      />
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
      hasPrevPage={!!prevPageId}
      hasNextPage={!!nextPageId}
    />
  )
}
