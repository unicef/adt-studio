import { useEffect, useMemo, useRef, useCallback, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, LayoutGrid, ListTree, RotateCcw, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { LoadingState } from "../../components/LoadingState"
import { StageEmptyState } from "../../components/StageEmptyState"
import { StoryboardSectionDetail } from "./components/StoryboardSectionDetail"
import { StoryboardQuizDetail } from "./components/StoryboardQuizDetail"
import { SectioningOverview } from "./components/SectioningOverview"
import { BookOutlineAudit } from "./components/BookOutlineAudit"
import { useSectionNav } from "@/hooks/use-section-nav"
import { useSlideSequence } from "@/hooks/use-slide-sequence"
import { findSlideIndex, resolveStructuralTarget, stepSlide } from "@/lib/slide-sequence"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { useHasUnsavedChanges } from "../../components/floating-save"
import { quizRouteId, parseQuizRouteId } from "@/lib/quiz-route"


export function StoryboardView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { t } = useLingui()
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const setSelectedPageId = onSelectPage ?? (() => {})
  const [overviewMode, setOverviewMode] = useState(false)
  const [outlineMode, setOutlineMode] = useState(false)
  const hasUnsavedChanges = useHasUnsavedChanges()
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey } = useApiKey()
  const hasStructuredTextProvider = useBookStructuredTextAvailability(bookLabel)
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
  // When idle, existing renderings outrank a stale stage status: a sectioning
  // edit marks storyboard for re-run without touching the HTML, and pushing the
  // run card in front of intact renderings would hide the very sections the user
  // came back to re-render. Matches the gate in StoryboardIndex.
  const hasRenderingData = (pages ?? []).some((p) => p.hasRendering)
  const showRunCard = storyboardRunning || storyboardState === "error"
    ? !hasPageData
    : !storyboardDone && !hasRenderingData

  const handleRunStoryboard = useCallback(() => {
    if (!hasStructuredTextProvider || !sectioningReady || storyboardRunning) return
    queueRun({ fromStage: "storyboard", toStage: "storyboard", apiKey })
  }, [hasStructuredTextProvider, sectioningReady, storyboardRunning, apiKey, queueRun])

  const pageList = pages ?? []
  const { selectedSectionId, selectSlide } = useSectionNav()
  // One sequence for the sidebar and for navigation. The arrows used to walk
  // `pages` — source-PDF order — so in a reordered book they moved somewhere
  // other than the row highlighted beside them, and skipped quizzes entirely.
  const { slides } = useSlideSequence(bookLabel)
  // When navigating backward across page boundary, resolve to last section
  const pendingLastSection = useRef(false)
  // Guard: prevent silent navigation while AI image is generating
  const isGeneratingRef = useRef(false)
  const handleGeneratingChange = useCallback((g: boolean) => { isGeneratingRef.current = g }, [])

  // Quizzes appear in the sidebar with a synthetic pageId of `quiz-{quizId}`.
  // When that pageId is in the URL we render the quiz panel instead of loading
  // page detail — calling usePage with a fake id would 404. `parseQuizRouteId`
  // also carries the legacy `quiz-{arrayIndex}` shape, and StoryboardIndex uses
  // it too so the sidebar highlights the same row this renders.
  const selectedQuizId = selectedPageIdProp
    ? parseQuizRouteId(selectedPageIdProp)
    : null
  const isQuizRoute = selectedQuizId != null

  // Auto-select a page when the URL names none.
  //
  // A link can carry `?section=` without a page — that is the shape of a shared
  // link to a slide. Land on the page that section belongs to rather than on
  // page one, which would silently drop what the link was pointing at.
  useEffect(() => {
    if (showRunCard || selectedPageIdProp || pageList.length === 0) return
    const named =
      selectedSectionId &&
      slides.find(
        (slide) => slide.kind === "section" && slide.section.sectionId === selectedSectionId,
      )
    if (named) {
      selectSlide({ pageId: named.page.pageId, sectionId: selectedSectionId }, { replace: true })
      return
    }
    setSelectedPageId(pageList[0].pageId)
  }, [
    selectedPageIdProp,
    pageList,
    showRunCard,
    setSelectedPageId,
    selectedSectionId,
    slides,
    selectSlide,
  ])

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

  // Memoised for identity: the `?? []` would otherwise be a new array on every
  // render while the page is loading, re-running the effects keyed on it.
  const sections = useMemo(
    () => page?.sectioningTree?.sections ?? [],
    [page?.sectioningTree],
  )
  const sectionCount = sections.length

  // The URL is the authority for which slide is open. Resolving it here rather
  // than in the layout keeps the layout from having to fetch page detail on
  // every stage, and by id rather than by index so the selection survives a
  // reload, a Back, and an edit that renumbers the page.
  const sectionIndex = useMemo(() => {
    if (!selectedSectionId) return 0
    const found = sections.findIndex((s) => s.sectionId === selectedSectionId)
    return found === -1 ? 0 : found
  }, [sections, selectedSectionId])

  const confirmUnsavedNavigation = useCallback(
    () =>
      !hasUnsavedChanges ||
      window.confirm(t`If you leave now, your unsaved changes will be lost.`),
    [hasUnsavedChanges, t],
  )

  /**
   * A structural edit names the section to open by its index in the tree the
   * edit produced — which this component has not received yet when the call
   * comes in. Resolving that index against the sections still in hand would
   * name the wrong section, or none at all: cloning the last section of a page
   * asks for an index the old array does not have.
   *
   * So the index is parked until the page data actually changes, and resolved
   * to an id then.
   */
  const [pendingSection, setPendingSection] = useState<
    { index: number; before: readonly unknown[] } | null
  >(null)

  const navigateToSection = useCallback(
    (
      index: number,
      options?: { replace?: boolean; afterStructuralEdit?: boolean },
    ) => {
      if (!confirmUnsavedNavigation()) return
      if (options?.afterStructuralEdit) {
        setPendingSection({ index, before: sections })
        return
      }
      const target = sections[index]
      if (!target || index === sectionIndex) return
      selectSlide({ sectionId: target.sectionId }, options)
    },
    [confirmUnsavedNavigation, sectionIndex, sections, selectSlide],
  )

  useEffect(() => {
    if (!pendingSection) return
    const resolved = resolveStructuralTarget(
      sections,
      pendingSection.before,
      pendingSection.index,
    )
    if (resolved.wait) return
    setPendingSection(null)
    // A consequence of an edit rather than a step the user took, so it corrects
    // the current history entry instead of adding one.
    if (resolved.sectionId) selectSlide({ sectionId: resolved.sectionId }, { replace: true })
  }, [pendingSection, sections, selectSlide])

  // Resolve pending "last section" once page data loads. Still needed: stepping
  // backwards across a page boundary has to name a section of a page whose
  // detail is not loaded yet, so the id is only knowable after the move.
  useEffect(() => {
    if (pendingLastSection.current && sectionCount > 0) {
      const last = sections[sectionCount - 1]
      pendingLastSection.current = false
      // A correction to the landing slide, not a step the user took.
      if (last) selectSlide({ sectionId: last.sectionId }, { replace: true })
    }
  }, [sectionCount, sections, selectSlide])

  // A section named by the URL that the page no longer has falls back to the
  // first one; say so in the URL too, so a reload does not keep the dead id.
  useEffect(() => {
    if (sectionCount === 0 || !selectedSectionId || pendingLastSection.current) return
    if (sections.some((s) => s.sectionId === selectedSectionId)) return
    selectSlide({ sectionId: sections[0].sectionId }, { replace: true })
  }, [sectionCount, sections, selectedSectionId, selectSlide])

  // Navigation — one step through the book's slide sequence, which is the same
  // list the sidebar draws. A quiz is a slide like any other, so the arrows now
  // step into and out of one instead of going dead on it.
  //
  // The sequence is draft-aware, so mid-rearrangement the arrows follow the
  // order on screen rather than the one last saved.
  const currentSlideIndex = useMemo(
    () =>
      findSlideIndex(slides, {
        quizId: isQuizRoute ? selectedQuizId : null,
        sectionId: isQuizRoute ? null : sections[sectionIndex]?.sectionId,
      }),
    [slides, isQuizRoute, selectedQuizId, sections, sectionIndex],
  )

  // Until the sequence has loaded, fall back to the page-level walk so the
  // arrows are not dead on first paint.
  const sequenceReady = slides.length > 0 && currentSlideIndex !== -1
  const canGoPrev = sequenceReady
    ? currentSlideIndex > 0
    : sectionIndex > 0 || !!prevPageId
  const canGoNext = sequenceReady
    ? currentSlideIndex < slides.length - 1
    : sectionIndex < sectionCount - 1 || !!nextPageId

  const confirmInterrupt = () =>
    !isGeneratingRef.current ||
    window.confirm(t`An AI image is being generated. Cancel it and navigate?`)

  /** Open the slide `delta` steps away in the book's order. */
  const goToSlide = (delta: -1 | 1) => {
    const target = stepSlide(slides, currentSlideIndex, delta)
    if (!target) return
    if (!confirmUnsavedNavigation()) return
    if (target.kind === "quiz") {
      // Through `selectSlide` rather than `setSelectedPageId`, which replaces
      // the history entry: a step onto a quiz is a step like any other, and
      // replacing would make Back skip the slide it was taken from.
      selectSlide({ pageId: quizRouteId(target.quizId), sectionId: null })
      return
    }
    // A section of another page needs both halves of the address; one of this
    // page needs only the section, so the page is not re-navigated.
    selectSlide(
      target.pageId === selectedPageId
        ? { sectionId: target.sectionId }
        : { pageId: target.pageId, sectionId: target.sectionId },
    )
  }

  const goPrev = () => {
    if (!confirmInterrupt()) return
    if (sequenceReady) {
      goToSlide(-1)
      return
    }
    if (sectionIndex > 0) {
      navigateToSection(sectionIndex - 1)
    } else if (prevPageId) {
      pendingLastSection.current = true
      setSelectedPageId(prevPageId)
    }
  }

  const goNext = () => {
    if (!confirmInterrupt()) return
    if (sequenceReady) {
      goToSlide(1)
      return
    }
    if (sectionIndex < sectionCount - 1) {
      navigateToSection(sectionIndex + 1)
    } else if (nextPageId) {
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
                if (!confirmInterrupt()) return
                navigateToSection(i)
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
      onClick={() => {
        if (!overviewMode && !confirmUnsavedNavigation()) return
        setOutlineMode(false)
        setOverviewMode((v) => !v)
      }}
      title={t`Overview`}
    >
      <Table2 className="h-3.5 w-3.5" />
    </button>
  )

  const outlineToggle = (
    <button
      type="button"
      className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
        outlineMode ? "bg-white/30 text-white" : "bg-white/15 hover:bg-white/25 text-white/70"
      }`}
      onClick={() => {
        if (!outlineMode && !confirmUnsavedNavigation()) return
        setOverviewMode(false)
        setOutlineMode((value) => !value)
      }}
      title={t`Book outline`}
    >
      <ListTree className="h-3.5 w-3.5" />
    </button>
  )

  const navigationArrows = (
    <div className="flex gap-1">
      {overviewToggle}
      {outlineToggle}
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

    if (outlineMode) {
      setOnLabelClick(null)
      setExtra(
        <>
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">{t`Book outline`}</span>
          <div className="ml-auto flex gap-1">
            {overviewToggle}
            {outlineToggle}
          </div>
        </>
      )
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
            {outlineToggle}
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
            {outlineToggle}
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
  }, [selectedPageId, selectedPageSummary?.pageNumber, sectionIndex, sectionCount, canGoPrev, canGoNext, prevPageId, nextPageId, setExtra, setOnLabelClick, page?.sectioningTree, showRunCard, overviewMode, outlineMode, isQuizRoute])

  // Keyboard arrow navigation.
  //
  // The handlers are reached through a ref rather than closed over: they now
  // read the slide sequence, which arrives after first paint, and a dependency
  // list that missed it would leave the keyboard walking source-PDF order while
  // the toolbar arrows walked the book's. Re-subscribing on every change would
  // work too, but this keeps one listener for the life of the view.
  const navRef = useRef({ goPrev, goNext, canGoPrev, canGoNext })
  navRef.current = { goPrev, goNext, canGoPrev, canGoNext }

  useEffect(() => {
    if (!selectedPageId || showRunCard) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't hijack arrows when user is typing in an input, textarea, or contenteditable
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return
      const nav = navRef.current
      if (e.key === "ArrowLeft" && nav.canGoPrev) {
        nav.goPrev()
      } else if (e.key === "ArrowRight" && nav.canGoNext) {
        nav.goNext()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedPageId, showRunCard])

  // Sectioning edits mark the storyboard stale without touching the renderings,
  // so the editor stays open on pages that are still perfectly editable — but
  // nothing said they were now behind the sections they came from. This is that
  // reminder, and the one place to regenerate the lot in a single pass, so a
  // restructuring session in Sectioning costs one render rather than one per
  // edit.
  const storyboardStale = !storyboardDone && !storyboardRunning && hasRenderingData
  const withStaleBanner = (content: ReactNode) =>
    storyboardStale ? (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-xs text-amber-900">
            <Trans>
              Sectioning has changed since these pages were rendered. Re-run Storyboard to
              regenerate them.
            </Trans>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-amber-300 bg-white px-3 text-xs text-amber-900 hover:bg-amber-100"
            onClick={handleRunStoryboard}
            disabled={!hasStructuredTextProvider || !sectioningReady || storyboardRunning}
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            <Trans>Re-run Storyboard</Trans>
          </Button>
        </div>
        <div className="flex-1 min-h-0">{content}</div>
      </div>
    ) : (
      content
    )

  if (showRunCard) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="storyboard"
          isRunning={storyboardRunning}
          completed={storyboardDone}
          onRun={handleRunStoryboard}
          disabled={!hasStructuredTextProvider || !sectioningReady || storyboardRunning}
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
    return withStaleBanner(
      <SectioningOverview
        bookLabel={bookLabel}
        pages={pageList}
        onNavigateToSection={(pageId, _sectionIdx, sectionId) => {
          setOverviewMode(false)
          selectSlide({ pageId, sectionId })
        }}
      />
    )
  }

  if (outlineMode) {
    return (
      <BookOutlineAudit
        bookLabel={bookLabel}
        onNavigateToPage={(pageId) => {
          setOutlineMode(false)
          // No section named: the view lands on the page's first one.
          selectSlide({ pageId })
        }}
      />
    )
  }

  // Quiz route: pseudo-pageId is `quiz-{quizId}`. Render the quiz panel.
  if (isQuizRoute && selectedQuizId != null) {
    return (
      <StoryboardQuizDetail
        bookLabel={bookLabel}
        quizId={selectedQuizId}
        // A quiz is a slide in the sequence, so it steps forwards and
        // backwards like any other rather than being a dead end.
        navigationArrows={navigationArrows}
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
          disabled={!hasStructuredTextProvider || !sectioningReady || storyboardRunning}
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

  return withStaleBanner(
    <StoryboardSectionDetail
      bookLabel={bookLabel}
      pageId={selectedPageId!}
      sectionIndex={sectionIndex}
      page={page}
      navigationExtra={navigationExtra}
      navigationArrows={navigationArrows}
      onGeneratingChange={handleGeneratingChange}
      onNavigateSection={navigateToSection}
      hasPrevPage={!!prevPageId}
      hasNextPage={!!nextPageId}
    />
  )
}
