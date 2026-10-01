import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { QuizItem } from "@/api/client"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { DockHandle } from "./chrome/DockHandle"
import { PipelineTopBar } from "./chrome/PipelineTopBar"
import { CanvasEmptyPanel } from "./canvas/CanvasEmptyPanel"
import { WorkspaceCanvasArea } from "./WorkspaceCanvasArea"
import { LeaveEditorDialog } from "./editor/LeaveEditorDialog"
import { SaveState } from "./editor/SaveState"
import { StoryboardShell } from "./editor/StoryboardShell"
import { useLeaveDialog, useLeaveGuard } from "./editor/useEditorGate"
import { useEditorSaveBar } from "./editor/useEditorSaveBar"
import { useStoryboardEditor } from "./editor/useStoryboardEditor"
import { WorkspacePanel } from "./panel/WorkspacePanel"
import { WorkspaceRail } from "./rail/WorkspaceRail"
import { SideRail } from "./rail/SideRail"
import { PluginDockPills as PluginDock } from "./plugins/PluginDockPills"
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
import type { PipelinePage, PipelineState } from "./shared/usePipelineState"
import { useStoryboardPhase } from "./shared/useStoryboardPhase"
import { useWorkspaceSelection } from "./shared/useWorkspaceSelection"
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

function breadcrumbMessage(page: PipelinePage | null, quiz: QuizItem | null) {
  if (quiz) return msg`Quiz ${quiz.quizIndex + 1}`
  if (page) return msg`Page ${page.pageNumber}`
  return null
}

export function PipelineWorkspace(props: PipelineWorkspaceProps) {
  return (
    <FloatingSaveProvider barClassName="bottom-27">
      <UnsavedChangesGuard />
      <WorkspaceBody {...props} />
    </FloatingSaveProvider>
  )
}

function WorkspaceBody({
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
  const { t, i18n } = useLingui()
  const [viewport, setViewport] = useCanvasViewport()
  const [zoom, setZoom] = useCanvasZoom()
  const [dockMinimized, setDockMinimized] = useDockMinimized()
  const storyboardRerun = useStoryboardRerun(label)
  const staleness = useStoryboardStaleness(state.pages)
  const [chromeHidden, setChromeHidden] = useState(false)
  const leave = useLeaveGuard()
  const { quizzes, quizVersion, activePage, activeQuiz, selectPage, selectQuiz } =
    useWorkspaceSelection({
      label,
      pages: state.pages,
      pageId,
      onSelectPage,
      guard: leave.guard,
    })

  const empty = !state.hasSections || !state.hasRendering
  const editablePage = !empty && !activeQuiz ? activePage : null
  const session = useStoryboardEditor({
    label,
    page: editablePage,
    enabled: editablePage !== null,
  })
  const leaveDialog = useLeaveDialog(session, leave)
  useEditorSaveBar(activePage?.pageNumber ?? 0, session)
  const editing = session.status === "ready"
  const breadcrumb = breadcrumbMessage(activePage, activeQuiz)
  const pageLabel = breadcrumb ? i18n._(breadcrumb) : undefined

  const toggleChrome = useCallback(() => setChromeHidden((hidden) => !hidden), [])
  const openSectioning = useCallback(() => onOpenStep("sectioning"), [onOpenStep])
  const openStoryboardSettings = useCallback(() => onOpenSettings("storyboard"), [onOpenSettings])

  useCanvasNavigation({
    pages: state.pages,
    quizzes,
    activePageId: activePage?.pageId ?? null,
    activeQuizIndex: activeQuiz?.quizIndex ?? null,
    enabled: navigationEnabled,
    onSelectPage: selectPage,
    onSelectQuiz: selectQuiz,
  })

  const { phase, emptyRun, foundationRunning } = useStoryboardPhase({
    hasSections: state.hasSections,
    extractActivity,
    sectioningActivity,
    storyboardActivity,
    sectioningRun,
    storyboardRun,
  })

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <PipelineTopBar
        label={label}
        pageLabel={empty ? undefined : pageLabel}
        version={empty || !activeQuiz ? null : quizVersion}
        versionPicker={
          !empty && !activeQuiz && activePage ? (
            <StoryboardVersionPicker label={label} page={activePage} viewport={viewport} />
          ) : undefined
        }
        status={editing ? <SaveState pageId={session.pageId} saving={session.saving} /> : undefined}
        rerun={<StageRerunButton slug="storyboard" rerun={storyboardRerun} variant="topbar" />}
        onPreview={() =>
          onOpenPreview(previewSectionId(activePage?.sections, activeQuiz?.quizIndex ?? null))
        }
        previewDisabled={empty}
        onOpenBookInfo={onOpenBookInfo}
      />

      <StoryboardShell session={session}>
        <div className="flex min-h-0 w-full flex-1">
          <SideRail widthClass="w-72">
            <WorkspaceRail
              label={label}
              pages={state.pages}
              quizzes={quizzes}
              activePageId={activePage?.pageId ?? null}
              activeQuizIndex={activeQuiz?.quizIndex ?? null}
              onSelect={selectPage}
              onSelectQuiz={selectQuiz}
              storyboardRunning={storyboardActivity.isActive}
              outdatedPageIds={staleness.outdatedPageIds}
              empty={empty}
              imageCount={state.imageCount}
              extracting={extractActivity.isActive}
              editable={editing}
            />
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
                onOpenSettings={openStoryboardSettings}
              />
            ) : (
              <WorkspaceCanvasArea
                label={label}
                activePage={activePage}
                activeQuiz={activeQuiz}
                quizVersion={quizVersion}
                pages={state.pages}
                session={session}
                viewport={viewport}
                onViewportChange={setViewport}
                zoom={zoom}
                onZoomChange={setZoom}
                chromeHidden={chromeHidden}
                onToggleChrome={toggleChrome}
                sectioning={sectioningRun}
                storyboardRunning={storyboardActivity.isActive}
                onOpenSectioning={openSectioning}
              />
            )}
          </div>

          <WorkspacePanel
            label={label}
            pageId={activeQuiz ? null : activePage?.pageId ?? null}
            sectionIndex={session.activeSection?.sectionIndex ?? 0}
            empty={empty}
            editable={editing}
          />
        </div>
      </StoryboardShell>

      <PluginDock
        foundations={state.foundations}
        plugins={state.plugins}
        onOpenPlugin={onOpenStep}
        hint={empty ? <Trans>Plugins unlock once the sections exist</Trans> : undefined}
        minimized={dockMinimized}
        onMinimize={() => setDockMinimized(true)}
      />
      <DockHandle visible={dockMinimized} onShow={() => setDockMinimized(false)} />

      <LeaveEditorDialog {...leaveDialog} />
    </div>
  )
}
