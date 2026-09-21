import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useQuizzes } from "@/hooks/use-quizzes"
import { AiEditPanel } from "./plugins/AiEditPanel"
import { DockHandle } from "./chrome/DockHandle"
import { PipelineTopBar } from "./chrome/PipelineTopBar"
import { CanvasEmptyPanel } from "./canvas/CanvasEmptyPanel"
import { CanvasViewportControls } from "./canvas/CanvasViewportControls"
import { PageCanvas } from "./canvas/PageCanvas"
import { QuizCanvas } from "./canvas/QuizCanvas"
import { PagesRail } from "./rail/PagesRail"
import { PagesRailEmpty } from "./rail/PagesRailEmpty"
import { SideRail } from "./rail/SideRail"
import { PluginDockPills as PluginDock } from "./plugins/PluginDockPills"
import type { StoryboardPhase } from "./canvas/StoryboardEmptyState"
import { useCanvasNavigation } from "./canvas/useCanvasNavigation"
import type { RunActivity, RunStageActivity } from "./runs/useRunActivity"
import type { SectioningRun } from "./runs/useSectioningRun"
import type { StoryboardRun } from "./runs/useStoryboardRun"
import { StageRerunButton } from "./runs/StageRerunButton"
import { useStoryboardRerun } from "./runs/useStoryboardRerun"
import { useStoryboardStaleness } from "./runs/useStoryboardStaleness"
import { StoryboardStaleBanner } from "./canvas/StoryboardStaleBanner"
import { StoryboardVersionPicker } from "./canvas/StoryboardVersionPicker"
import { previewSectionId } from "./shared/previewTarget"
import type { PipelineState } from "./shared/usePipelineState"
import {
  useCanvasViewport,
  useCanvasZoom,
  useDockMinimized,
} from "./shared/workspacePrefs"

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
  onOpenPreview: (sectionId: string | null) => void
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
  const storyboardRerun = useStoryboardRerun(label)
  const staleness = useStoryboardStaleness(state.pages)
  const [chromeHidden, setChromeHidden] = useState(false)
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
        version={empty || !activeQuiz ? null : quizzesQuery.data?.version ?? null}
        versionPicker={
          !empty && !activeQuiz && activePage ? (
            <StoryboardVersionPicker
              label={label}
              page={activePage}
              viewport={viewport}
            />
          ) : undefined
        }
        rerun={<StageRerunButton slug="storyboard" rerun={storyboardRerun} variant="topbar" />}
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
              outdatedPageIds={staleness.outdatedPageIds}
            />
          )}
        </SideRail>

        <div className="relative flex min-w-0 flex-1 flex-col items-center overflow-hidden bg-accent">
          {staleness.isStale && (
            <StoryboardStaleBanner
              rerun={storyboardRerun}
              outdatedCount={staleness.outdatedCount}
            />
          )}
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
