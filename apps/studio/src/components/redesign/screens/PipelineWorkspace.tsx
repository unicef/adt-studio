import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQuizzes } from "@/hooks/use-quizzes"
import { AiEditPanel } from "./pipeline/plugins/AiEditPanel"
import { DockHandle } from "./pipeline/chrome/DockHandle"
import { PipelineStatus } from "./pipeline/chrome/PipelineStatus"
import { PipelineTopBar } from "./pipeline/chrome/PipelineTopBar"
import { CanvasEmptyPanel } from "./pipeline/canvas/CanvasEmptyPanel"
import { CanvasViewportControls } from "./pipeline/canvas/CanvasViewportControls"
import { PageCanvas } from "./pipeline/canvas/PageCanvas"
import { QuizCanvas } from "./pipeline/canvas/QuizCanvas"
import { PagesRail } from "./pipeline/rail/PagesRail"
import { PagesRailEmpty } from "./pipeline/rail/PagesRailEmpty"
import { SideRail } from "./pipeline/rail/SideRail"
import { PluginDockPills as PluginDock } from "./pipeline/plugins/PluginDockPills"
import type { StoryboardPhase } from "./pipeline/canvas/StoryboardEmptyState"
import { useCanvasNavigation } from "./pipeline/canvas/useCanvasNavigation"
import type { RunActivity, RunStageActivity } from "./pipeline/runs/useRunActivity"
import type { SectioningRun } from "./pipeline/runs/useSectioningRun"
import type { StoryboardRun } from "./pipeline/runs/useStoryboardRun"
import { previewSectionId } from "./pipeline/shared/previewTarget"
import type { PipelineState } from "./pipeline/shared/usePipelineState"
import {
  useCanvasViewport,
  useCanvasZoom,
  useDockMinimized,
} from "./pipeline/shared/workspacePrefs"

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
  /** Page the canvas shows, straight off the URL. Null falls back to the first page. */
  pageId: string | null
  onSelectPage: (pageId: string) => void
  onOpenStep: (slug: string) => void
  onOpenSettings: (slug: string) => void
  /** Opens the packaged book, landing on the section the canvas is showing. */
  onOpenPreview: (sectionId: string | null) => void
  /** Opens the book's cover and metadata. */
  onOpenBookInfo: () => void
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
  onOpenPreview,
  onOpenBookInfo,
}: PipelineWorkspaceProps) {
  const { t } = useLingui()
  const [viewport, setViewport] = useCanvasViewport()
  const [zoom, setZoom] = useCanvasZoom()
  const [dockMinimized, setDockMinimized] = useDockMinimized()
  const [chromeHidden, setChromeHidden] = useState(false)
  // A quiz is a storyboard page of its own, so selecting one takes over the canvas.
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

  const selectPage = (nextPageId: string) => {
    setSelectedQuizIndex(null)
    onSelectPage(nextPageId)
  }

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
  const phase: StoryboardPhase = state.hasSections ? "render" : "sections"
  const emptyRun = phase === "render" ? storyboardRun : sectioningRun
  const runningStage = run.activeStages.find((s) => s.state === "running") ?? run.activeStages[0]
  const foundationRunning = extractActivity.isActive
    ? extractActivity
    : sectioningActivity.isActive
      ? sectioningActivity
      : storyboardActivity.isActive
        ? storyboardActivity
        : null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <PipelineTopBar
        label={label}
        pageLabel={
          empty
            ? undefined
            : activeQuiz
              ? t`Quiz ${activeQuiz.quizIndex + 1}`
              : activePage
                ? t`Page ${activePage.pageNumber}`
                : undefined
        }
        version={
          empty ? null : activeQuiz ? quizzesQuery.data?.version ?? null : activePage?.renderingVersion ?? null
        }
        status={
          <PipelineStatus
            state={state}
            runningStage={runningStage}
            empty={empty}
            phase={phase}
          />
        }
        onPreview={() =>
          onOpenPreview(
            previewSectionId(activePage?.sections, activeQuiz?.quizIndex ?? null),
          )
        }
        previewDisabled={empty}
        onOpenBookInfo={onOpenBookInfo}
      />

      <div className="relative flex min-h-0 flex-1">
        <SideRail widthClass="w-64">
          {empty ? (
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
            />
          )}
        </SideRail>

        <div className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden bg-accent">
          {empty ? (
            <CanvasEmptyPanel
              run={run}
              foundationRunning={foundationRunning}
              phase={phase}
              pageCount={state.pages.length}
              sectionCount={state.sectionCount}
              emptyRun={emptyRun}
              onOpenSettings={() => onOpenSettings("storyboard")}
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
                    />
                  )
                )}
                <CanvasViewportControls
                  viewport={viewport}
                  onViewportChange={setViewport}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  chromeHidden={chromeHidden}
                  onToggleChrome={() => setChromeHidden((hidden) => !hidden)}
                />
              </>
            )
          )}
        </div>

        <AiEditPanel
          label={label}
          pageId={activeQuiz ? null : activePage?.pageId ?? null}
          pageLabel={
            activeQuiz
              ? t`quiz ${activeQuiz.quizIndex + 1}`
              : activePage
                ? t`page ${activePage.pageNumber}`
                : undefined
          }
          sectionIndex={activePage?.sections[0]?.sectionIndex ?? 0}
          empty={empty}
        />
      </div>

      <PluginDock
        foundations={state.foundations}
        plugins={state.plugins}
        onOpenPlugin={onOpenStep}
        hint={empty ? <Trans>Plugins unlock once the sections exist</Trans> : undefined}
        minimized={dockMinimized}
        onMinimize={() => setDockMinimized(true)}
      />
      <DockHandle visible={dockMinimized} onShow={() => setDockMinimized(false)} />
    </div>
  )
}
