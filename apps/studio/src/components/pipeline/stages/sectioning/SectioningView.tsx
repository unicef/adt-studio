import { useEffect, useCallback, useState } from "react"
import { ArrowLeft, ArrowRight, LayoutGrid, Table2 } from "lucide-react"
import { usePages, usePage } from "@/hooks/use-pages"
import { useStepHeader } from "../../components/StepViewRouter"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { StageRunCard } from "../../components/StageRunCard"
import { LoadingState } from "../../components/LoadingState"
import { StageEmptyState } from "../../components/StageEmptyState"
import { SectioningPageDetail } from "./SectioningPageDetail"
import { SectioningOverview } from "../storyboard/components/SectioningOverview"
import { Trans } from "@lingui/react/macro"
import { useLingui } from "@lingui/react/macro"

export function SectioningView({ bookLabel, selectedPageId: selectedPageIdProp, onSelectPage }: { bookLabel: string; selectedPageId?: string; onSelectPage?: (pageId: string | null) => void }) {
  const { t } = useLingui()
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const setSelectedPageId = onSelectPage ?? (() => {})
  const [overviewMode, setOverviewMode] = useState(false)
  const { setExtra, setOnLabelClick } = useStepHeader()
  const { stageState, queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const sectioningState = stageState("sectioning")
  const sectioningDone = sectioningState === "done"
  const sectioningRunning = sectioningState === "running" || sectioningState === "queued"
  const hasPageData = (pages ?? []).some((p) => p.sectionCount > 0)
  const showRunCard = sectioningRunning || sectioningState === "error"
    ? !hasPageData
    : !sectioningDone

  const handleRunSectioning = useCallback(() => {
    if (!hasApiKey || sectioningRunning) return
    queueRun({ fromStage: "sectioning", toStage: "sectioning", apiKey })
  }, [hasApiKey, sectioningRunning, apiKey, queueRun])

  const pageList = pages ?? []

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

  const canGoPrev = !!prevPageId
  const canGoNext = !!nextPageId

  const goPrev = () => {
    if (prevPageId) setSelectedPageId(prevPageId)
  }

  const goNext = () => {
    if (nextPageId) setSelectedPageId(nextPageId)
  }

  const navigationExtra = selectedPageSummary ? (
    <>
      <span className="text-white/40 text-sm">/</span>
      <span className="text-sm font-medium">
        {t`Page ${String(selectedPageSummary.pageNumber)}`}
      </span>
    </>
  ) : null

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

  useEffect(() => {
    if (showRunCard) {
      setOnLabelClick(null)
      setExtra(null)
      return () => {
        setExtra(null)
        setOnLabelClick(null)
      }
    }

    if (overviewMode) {
      setOnLabelClick(null)
      setExtra(
        <div className="flex-1 flex items-center gap-3">
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">{t`Overview`}</span>
          <div className="ml-auto flex gap-1">
            {overviewToggle}
          </div>
        </div>
      )
      return () => {
        setExtra(null)
        setOnLabelClick(null)
      }
    }

    // The SectioningPageDetail component owns the header when a page is loaded.
    if (page?.sectioningTree) return

    if (selectedPageSummary) {
      setOnLabelClick(null)
      setExtra(
        <div className="flex-1 flex items-center gap-3">
          <span className="text-white/40 text-sm">/</span>
          <span className="text-sm font-medium">{t`Page ${String(selectedPageSummary.pageNumber)}`}</span>
          <div className="ml-auto flex gap-1">
            {navigationArrows}
          </div>
        </div>
      )
    } else {
      setOnLabelClick(null)
      setExtra(null)
    }
    return () => {
      setExtra(null)
      setOnLabelClick(null)
    }
  }, [selectedPageId, selectedPageSummary?.pageNumber, canGoPrev, canGoNext, prevPageId, nextPageId, setExtra, setOnLabelClick, page?.sectioningTree, showRunCard, overviewMode])

  useEffect(() => {
    if (!selectedPageId || showRunCard) return
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [selectedPageId, canGoPrev, canGoNext, prevPageId, nextPageId, showRunCard])

  if (showRunCard) {
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="sectioning"
          isRunning={sectioningRunning}
          completed={sectioningDone}
          onRun={handleRunSectioning}
          disabled={!hasApiKey || sectioningRunning}
        />
      </div>
    )
  }

  if (pagesLoading) {
    return <LoadingState stageSlug="sectioning" label={<Trans>Loading pages...</Trans>} />
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

  if (overviewMode) {
    return (
      <SectioningOverview
        bookLabel={bookLabel}
        pages={pageList}
        onNavigateToSection={(pageId) => {
          setOverviewMode(false)
          setSelectedPageId(pageId)
        }}
      />
    )
  }

  if (pageLoading || !page) {
    return <LoadingState stageSlug="sectioning" label={<Trans>Loading page...</Trans>} />
  }

  if (!page.sectioningTree) {
    if (sectioningRunning) {
      return <LoadingState stageSlug="sectioning" label={<Trans>Waiting for page to be processed...</Trans>} />
    }
    return (
      <div className="p-4">
        <StageRunCard
          stageSlug="sectioning"
          isRunning={sectioningRunning}
          completed={sectioningDone}
          onRun={handleRunSectioning}
          disabled={!hasApiKey || sectioningRunning}
        />
      </div>
    )
  }

  if (page.sectioningTree.sections.length === 0) {
    return (
      <StageEmptyState
        icon={LayoutGrid}
        color="sky"
        title={<Trans>No sections for this page</Trans>}
        subtitle={<Trans>This page has no sectioning output</Trans>}
      />
    )
  }

  return (
    <SectioningPageDetail
      bookLabel={bookLabel}
      pageId={selectedPageId!}
      page={page}
      navigationExtra={navigationExtra}
      navigationArrows={navigationArrows}
      hasPrevPage={canGoPrev}
      hasNextPage={canGoNext}
    />
  )
}
