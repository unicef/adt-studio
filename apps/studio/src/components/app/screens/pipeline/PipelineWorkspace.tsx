import { useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { useQuizzes } from "@/hooks/use-quizzes"
import { PipelineTopBar } from "./chrome/PipelineTopBar"
import { CanvasEmptyPanel } from "./canvas/CanvasEmptyPanel"
import { CanvasViewportControls } from "./canvas/CanvasViewportControls"
import { StoryboardTools } from "./canvas/tools/StoryboardTools"
import { RightPanel } from "./plugins/RightPanel"
import { usePanelFit } from "./shared/panelFit"
import { RAIL_WIDTH_CLASS } from "./shared/panelLayout"
import { PageCanvas } from "./canvas/PageCanvas"
import { QuizCanvas } from "./canvas/QuizCanvas"
import { PagesRail } from "./rail/PagesRail"
import { PagesRailEmpty } from "./rail/PagesRailEmpty"
import { SideRail } from "./rail/SideRail"
import { useChromeRoot } from "@/components/app/lab/chrome"
import type { StoryboardPhase } from "./canvas/StoryboardEmptyState"
import { useCanvasNavigation } from "./canvas/useCanvasNavigation"
import type { RunActivity, RunStageActivity } from "./runs/useRunActivity"
import type { SectioningRun } from "./runs/useSectioningRun"
import type { StoryboardRun } from "./runs/useStoryboardRun"
import { useStoryboardRerun } from "./runs/useStoryboardRerun"
import { useStoryboardStaleness } from "./runs/useStoryboardStaleness"
import { StalePageChip } from "./canvas/stale/StaleNotices"
import { useStaleNotice } from "./canvas/stale/useStaleNotice"
import { usePageRebuild } from "./runs/usePageRebuild"
import { StoryboardVersionPicker } from "./canvas/StoryboardVersionPicker"
import type { PipelineState } from "./shared/usePipelineState"
import {
  useCanvasViewport,
  useCanvasZoom,
} from "./shared/workspacePrefs"
import { STORYBOARD_HEX } from "./shared/plugins"
import { useVariant } from "@/components/app/lab/variants"
import { cn } from "@/lib/utils"
import { useBookRun } from "@/hooks/use-book-run"
import { CanvasEditingProvider } from "./canvas/editing/CanvasEditing"
import { LayersTree } from "./canvas/editing/layers/LayersTree"
import { CanvasSaveBar } from "./canvas/editing/CanvasSaveBar"
import { StoryboardToolsProvider } from "./canvas/tools/StoryboardToolsContext"
import { HtmlSourcePanel } from "./canvas/tools/HtmlSourcePanel"
import { GenerateActivityStatus } from "./canvas/tools/GenerateActivityStatus"
import type { RailTab } from "./rail/PagesRail"

export interface PipelineWorkspaceProps {
  label: string
  state: PipelineState
  run: RunActivity
  extractActivity: RunStageActivity
  sectioningActivity: RunStageActivity
  storyboardActivity: RunStageActivity
  sectioningRun: SectioningRun
  storyboardRun: StoryboardRun
  navigationEnabled: boolean
  pageId: string | null
  onSelectPage: (pageId: string) => void
  onOpenStep: (slug: string) => void
  onOpenSettings: (slug: string) => void
}

export function PipelineWorkspace({
  label,
  state,
  run,
  extractActivity,
  sectioningActivity,
  storyboardActivity,
  sectioningRun,
  storyboardRun,
  navigationEnabled,
  pageId,
  onSelectPage,
  onOpenStep,
  onOpenSettings,
}: PipelineWorkspaceProps) {
  const { t } = useLingui()
  const [viewport, setViewport] = useCanvasViewport()
  const [zoom, setZoom] = useCanvasZoom()
  const chrome = useChromeRoot(STORYBOARD_HEX)
  const contentLoaders = useVariant("loaders") === "content"
  const [railTab, setRailTab] = useState<RailTab>("pages")
  const storyboardRerun = useStoryboardRerun(label)
  const staleness = useStoryboardStaleness(label, state.pages)
  const pageRebuild = usePageRebuild(label)
  const [chromeHidden, setChromeHidden] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  usePanelFit(rowRef)
  const [selectedQuizIndex, setSelectedQuizIndex] = useState<number | null>(null)
  const quizzesQuery = useQuizzes(label)
  const quizzes = useMemo(
    () => quizzesQuery.data?.quizzes?.quizzes ?? [],
    [quizzesQuery.data],
  )

  const activePage = useMemo(() => {
    if (state.pages.length === 0) return null
    return state.pages.find((p) => p.pageId === pageId) ?? state.pages[0]
  }, [state.pages, pageId])

  const activeQuiz = useMemo(
    () =>
      selectedQuizIndex == null
        ? null
        : quizzes.find((quiz) => quiz.quizIndex === selectedQuizIndex) ?? null,
    [quizzes, selectedQuizIndex],
  )
  useEffect(() => {
    if (activeQuiz && railTab === "layers") setRailTab("pages")
  }, [activeQuiz, railTab])

  const selectPage = (nextPageId: string) => {
    setSelectedQuizIndex(null)
    onSelectPage(nextPageId)
  }

  const staleNotice = useStaleNotice({
    pages: state.pages,
    page: activeQuiz ? null : activePage,
    staleness,
    rerun: storyboardRerun,
    rebuild: pageRebuild,
    onSelectPage: selectPage,
  })

  useCanvasNavigation({
    pages: state.pages,
    quizzes,
    activePageId: activePage?.pageId ?? null,
    activeQuizIndex: activeQuiz?.quizIndex ?? null,
    enabled: navigationEnabled,
    onSelectPage: selectPage,
    onSelectQuiz: setSelectedQuizIndex,
  })

  const empty = !state.hasSections || !state.hasRendering
  const buildingFirstPages =
    contentLoaders && state.hasSections && !state.hasRendering && storyboardActivity.isActive && state.pages.length > 0
  const showEmptyPanel = empty && !buildingFirstPages
  const phase: StoryboardPhase = state.hasSections ? "render" : "sections"
  const emptyRun = phase === "render" ? storyboardRun : sectioningRun
  const foundationRunning = extractActivity.isActive
    ? extractActivity
    : sectioningActivity.isActive
      ? sectioningActivity
      : storyboardActivity.isActive
        ? storyboardActivity
        : null

  const editingPageId = empty || activeQuiz ? null : activePage?.pageId ?? null
  const editingEnabled = !!editingPageId

  const versionPicker =
    !empty && !activeQuiz && activePage ? (
      <StoryboardVersionPicker
        label={label}
        page={activePage}
        viewport={viewport}
      />
    ) : undefined
  const quizVersion = empty || !activeQuiz ? null : quizzesQuery.data?.version ?? null
  const topChrome = (
    <PipelineTopBar
      pageLabel={
        showEmptyPanel
          ? undefined
          : activeQuiz
            ? t`Quiz ${activeQuiz.quizIndex + 1}`
            : activePage
              ? t`Page ${activePage.pageNumber}`
              : undefined
      }
      version={quizVersion}
      versionPicker={versionPicker}
      onOpenSettings={() => onOpenSettings("storyboard")}
    />
  )

  const aiProps = {
    label,
    pageId: activeQuiz ? null : activePage?.pageId ?? null,
    pageLabel: activeQuiz
      ? t`quiz ${activeQuiz.quizIndex + 1}`
      : activePage
        ? t`page ${activePage.pageNumber}`
        : undefined,
    sectionIndex: activePage?.sections[0]?.sectionIndex ?? 0,
    empty,
    context: "storyboard" as const,
    sections: activeQuiz ? undefined : activePage?.sections,
  }

  return (
    <CanvasEditingProvider label={label} pageId={editingPageId} enabled={editingEnabled} locked={storyboardActivity.isActive}>
    <StoryboardToolsProvider label={label} page={editingPageId ? activePage : null} storyboardRunning={storyboardActivity.isActive}>
    <div {...chrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {topChrome}


      <div ref={rowRef} data-chrome="row" className="relative flex min-h-0 flex-1">
        <SideRail widthClass={RAIL_WIDTH_CLASS} empty={showEmptyPanel}>
          {showEmptyPanel ? (
            <PagesRailEmpty
              pageCount={state.pages.length}
              imageCount={state.imageCount}
              extracting={extractActivity.isActive}
            />
          ) : (
            <PagesRail
              label={label}
              pages={state.pages}
              quizzes={quizzes}
              activePageId={activePage?.pageId ?? null}
              activeQuizIndex={activeQuiz?.quizIndex ?? null}
              onSelect={selectPage}
              onSelectQuiz={setSelectedQuizIndex}
              storyboardRunning={storyboardActivity.isActive}
              outdatedPageIds={staleness.outdatedPageIds}
              rebuildingPageIds={pageRebuild.rebuilding}
              tab={activeQuiz ? "pages" : railTab}
              onTabChange={setRailTab}
              layersDisabled={!!activeQuiz}
              layers={<LayersTree label={label} pageId={editingPageId} title={activePage ? t`Page ${activePage.pageNumber}` : undefined} sections={activePage?.sections ?? []} />}
            />
          )}
        </SideRail>

        <main id="pipeline-canvas" tabIndex={-1} aria-label={t`Page canvas`} className="flex min-h-0 min-w-0 flex-1 flex-col outline-none">
        <div
          data-chrome="center"
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden transition-[background-color] duration-300",
            "bg-accent",
          )}
        >
          {showEmptyPanel ? (
            <CanvasEmptyPanel
              run={run}
              foundationRunning={foundationRunning}
              phase={phase}
              pageCount={state.pages.length}
              sectionCount={state.sectionCount}
              emptyRun={emptyRun}
              onOpenSettings={() => onOpenSettings("storyboard")}
              label={label}
              pages={state.pages}
            />
          ) : (
            (activeQuiz || activePage) && (
              <>
                {activeQuiz ? (
                  <QuizCanvas
                    label={label}
                    quiz={activeQuiz}
                    version={quizzesQuery.data?.version ?? null}
                    pages={state.pages}
                    viewport={viewport}
                    zoom={zoom}
                    onZoomChange={setZoom}
                  />
                ) : (
                  activePage && (
                    <PageCanvas
                      label={label}
                      page={activePage}
                      viewport={viewport}
                      zoom={zoom}
                      onZoomChange={setZoom}
                      sectioning={sectioningRun}
                      storyboardRunning={storyboardActivity.isActive}
                      onOpenSectioning={() => onOpenStep("sectioning")}
                      notice={staleness.isStale ? <StalePageChip notice={staleNotice} /> : undefined}
                    />
                  )
                )}
                {!activeQuiz && <HtmlSourcePanel />}
                {!activeQuiz && <GenerateActivityStatus />}
                <CanvasSaveBar />
                <CanvasViewportControls
                  viewport={viewport}
                  onViewportChange={setViewport}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  chromeHidden={chromeHidden}
                  onToggleChrome={() => setChromeHidden((hidden) => !hidden)}
                  tools={activeQuiz ? undefined : <StoryboardTools />}
                />
              </>
            )
          )}
        </div>
        </main>

        <RightPanel label={label} viewport={viewport} editingEnabled={editingEnabled} ai={aiProps} />
      </div>
    </div>
    </StoryboardToolsProvider>
    </CanvasEditingProvider>
  )
}
