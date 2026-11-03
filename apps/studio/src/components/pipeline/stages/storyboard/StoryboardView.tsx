import { StoryboardSourceNotice } from "../../components/StoryboardSourceNotice"
import { useEffect, useRef, useCallback, useState, useMemo, type ReactNode } from "react"
import { useSearch, useNavigate } from "@tanstack/react-router"
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
import { useSectionNav } from "@/routes/books.$label"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"
import { useHasUnsavedChanges } from "../../components/floating-save"
import { parseQuizRouteId } from "@/lib/quiz-route"
import { usePublicationComments } from "@/hooks/use-publication-feedback"
import { useCommentsMode } from "./components/feedback/use-comments-mode"
import { currentSectionLocations } from "./components/feedback/current-section-locations"


export function StoryboardView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { t } = useLingui()
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const setSelectedPageId = onSelectPage ?? (() => {})
  const [overviewMode, setOverviewMode] = useState(false)
  const [outlineMode, setOutlineMode] = useState(false)
  const hasUnsavedChanges = useHasUnsavedChanges()
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { stageState, queueRun, storyboardCoverage, sourceUpdateStages = [] } = useBookRun()
  const { apiKey } = useApiKey()
  const hasStructuredTextProvider = useBookStructuredTextAvailability(bookLabel)
  const storyboardState = stageState("storyboard")
  const storyboardDone = storyboardState === "done"
  const storyboardRunning = storyboardState === "running" || storyboardState === "queued"
  const sectioningReady = stageState("sectioning") === "done" || (pages ?? []).some((page) => page.sectioningVersion != null)
  // Saved pages stay available during attempts; starting or cancelling a run
  // does not remove the current rendering from the query cache.
  const hasPageData = (pages ?? []).some((p) => p.sectionCount > 0)
  // When idle, existing renderings outrank a stale stage status: a sectioning
  // edit marks storyboard for re-run without touching the HTML, and pushing the
  // run card in front of intact renderings would hide the very sections the user
  // came back to re-render. Matches the gate in StoryboardIndex.
  const hasRenderingData = (pages ?? []).some((p) => p.hasRendering)
  // A reset may remove all active HTML while a saved-tree editor holds a
  // local draft. Keep that editor until the user saves/discards or navigates.
  const showRunCard = !(hasUnsavedChanges && hasPageData) && (
    storyboardRunning || storyboardState === "error"
      ? !hasPageData
      : !storyboardDone && !hasRenderingData
  )

  const handleRunStoryboard = useCallback(() => {
    if (!hasStructuredTextProvider || !sectioningReady || storyboardRunning) return
    queueRun({ fromStage: "storyboard", toStage: "storyboard", apiKey })
  }, [hasStructuredTextProvider, sectioningReady, storyboardRunning, apiKey, queueRun])

  const pageList = pages ?? []
  const { sectionIndex, setSectionIndex, skipNextResetRef } = useSectionNav()

  const search = useSearch({ strict: false }) as { section?: number; sectionId?: string; comment?: string }
  const navigate = useNavigate()
  const commentsMode = useCommentsMode(bookLabel)
  const linkedComments = usePublicationComments(bookLabel, !!search.comment)
  const linkedComment = linkedComments.data?.comments.find((comment) => comment.id === search.comment && !comment.deleted_at)
  // Old comment URLs carried only an ordinal. Resolve the comment itself before
  // selecting anything; the ordinal must never choose the owner of feedback.
  const linkedId = search.comment ? linkedComment?.page_section_id : search.sectionId
  const locations = useMemo(() => currentSectionLocations(pages ?? []), [pages])
  const linkedLocation = linkedId ? locations.get(linkedId) : undefined
  const hasFeedbackLink = !!(search.comment || search.sectionId)
  const linkKey = JSON.stringify([search.comment, search.sectionId, search.section, selectedPageIdProp])
  const appliedSectionRef = useRef<string | null>(null)
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

  const { data: latestPage, isLoading: pageLoading } = usePage(
    bookLabel,
    !isQuizRoute && selectedPageId ? selectedPageId : "",
  )

  // A successful regeneration can remove the selected section while its
  // editor still owns a draft. Retain that editor's original identity/version
  // context; never assign the draft to the new section at the same ordinal.
  // Same-identity refreshes and our own Save acknowledgements stay live.
  const editorScope = JSON.stringify([bookLabel, selectedPageId, sectionIndex])
  const editorPageRef = useRef<{ scope: string; page: NonNullable<typeof latestPage> } | null>(null)
  const previousEditor = editorPageRef.current
  const previousSection = previousEditor?.page.sectioningTree?.sections[sectionIndex]
  const latestSection = latestPage?.sectioningTree?.sections[sectionIndex]
  const retainDraftContext = hasUnsavedChanges && previousEditor?.scope === editorScope && !!previousSection && (
    !latestSection || latestSection.sectionId !== previousSection.sectionId
  )
  if (!retainDraftContext && latestPage) editorPageRef.current = { scope: editorScope, page: latestPage }
  const page = retainDraftContext ? previousEditor?.page : latestPage

  const sectionCount = page?.sectioningTree?.sections.length ?? 0

  const linkedSections = (page?.sectioningTree?.sections ?? []).flatMap((section, index) => section.sectionId === linkedId ? [index] : [])
  const linkedIndex = linkedSections.length === 1 ? linkedSections[0] : undefined
  useEffect(() => {
    if (appliedSectionRef.current === linkKey || hasUnsavedChanges) return
    if (hasFeedbackLink) {
      if (!linkedLocation || !linkedId) return
      if (linkedLocation.pageId !== selectedPageIdProp) {
        void navigate({ to: "/books/$label/$step/$pageId", params: { label: bookLabel, step: "storyboard", pageId: linkedLocation.pageId }, search: { sectionId: linkedId, comment: search.comment }, replace: true })
        return
      }
      if (linkedIndex === undefined) return
      if (search.comment) commentsMode.open(search.comment, linkedId)
      setSectionIndex(linkedIndex)
    } else if (search.section !== undefined) setSectionIndex(search.section)
    appliedSectionRef.current = linkKey
  }, [linkKey, hasUnsavedChanges, hasFeedbackLink, linkedId, linkedLocation, linkedIndex, selectedPageIdProp, search.comment, search.section, setSectionIndex, commentsMode.open, navigate, bookLabel])

  const confirmUnsavedNavigation = useCallback(
    () =>
      !hasUnsavedChanges ||
      window.confirm(t`If you leave now, your unsaved changes will be lost.`),
    [hasUnsavedChanges, t],
  )

  const navigateToSection = useCallback(
    (index: number) => {
      if (index === sectionIndex || !confirmUnsavedNavigation()) return
      setSectionIndex(index)
    },
    [confirmUnsavedNavigation, sectionIndex, setSectionIndex],
  )

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
      navigateToSection(sectionIndex - 1)
    } else if (prevPageId) {
      pendingLastSection.current = true
      skipNextResetRef.current = true
      setSelectedPageId(prevPageId)
    }
  }

  const goNext = () => {
    if (isGeneratingRef.current && !window.confirm(t`An AI image is being generated. Cancel it and navigate?`)) return
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
                if (isGeneratingRef.current && !window.confirm(t`An AI image is being generated. Cancel it and navigate?`)) return
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

  // Attempt state is not evidence that Sectioning changed. Only the shared
  // saved-output read model can identify genuinely missing output here.
  const storyboardStale = storyboardCoverage?.complete === false && !storyboardRunning && hasRenderingData
  // Keep the editor subtree mounted when coverage or attempt state changes.
  // Adding/removing its wrapper would silently discard local editor drafts.
  const withStaleBanner = (content: ReactNode) => (
      <div className="flex flex-col h-full min-h-0">
        {sourceUpdateStages.includes("storyboard") && <StoryboardSourceNotice />}
        {storyboardStale && <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-xs text-amber-900">
            <Trans>
              Some pages or sections are missing Storyboard output. Existing pages remain available.
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
        </div>}
        {retainDraftContext && <div role="status" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Trans>Saved sections changed. Your unsaved editor is retained against its original version. Discard your edits to load the current section.</Trans>
        </div>}
        <div className="flex-1 min-h-0">{content}</div>
      </div>
    )

  if (showRunCard && !retainDraftContext) {
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

  if (pagesLoading && !retainDraftContext) {
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
        onNavigateToSection={(pageId, sectionIdx) => {
          setOverviewMode(false)
          setSelectedPageId(pageId)
          setSectionIndex(sectionIdx)
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
          setSectionIndex(0)
          setSelectedPageId(pageId)
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
        navigationArrows={
          <div className="flex gap-1">{overviewToggle}{outlineToggle}</div>
        }
      />
    )
  }

  if ((pageLoading && !retainDraftContext) || !page) {
    return <LoadingState stageSlug="storyboard" label={<Trans>Loading page...</Trans>} />
  }

  if (hasFeedbackLink && appliedSectionRef.current !== linkKey && !hasUnsavedChanges) {
    if ((search.comment && linkedComments.isPending) || (linkedLocation && linkedLocation.pageId !== selectedPageIdProp)) {
      return <LoadingState stageSlug="storyboard" label={<Trans>Loading page...</Trans>} />
    }
    if (!linkedLocation || linkedIndex === undefined) {
      return <p role="status" className="p-4 text-sm"><Trans>This comment’s section is unavailable in the current book. Its feedback remains in Sharing.</Trans></p>
    }
  }

  const ownershipWarning = page.sectioningSynchronization?.sections.some(section => section.status === "structural-drift") && (
      <div role="status" className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <Trans>Some retained renderings no longer match this page’s sections. Their content and history are preserved, but they are omitted from Preview and export. Editing a section changes only its matching rendering.</Trans>
      </div>
    )

  if (!page.sectioningTree) {
    if (storyboardRunning) {
      return <LoadingState stageSlug="storyboard" label={<Trans>Waiting for page to be processed...</Trans>} />
    }
    return (
      <div className="p-4">
        {ownershipWarning}
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
      <>
      {ownershipWarning}
      <StageEmptyState
        icon={LayoutGrid}
        color="violet"
        title={<Trans>No sections for this page</Trans>}
        subtitle={<Trans>This page has no storyboard sections</Trans>}
      />
      </>
    )
  }

  return withStaleBanner(
    <>
    {ownershipWarning}
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
    </>
  )
}
