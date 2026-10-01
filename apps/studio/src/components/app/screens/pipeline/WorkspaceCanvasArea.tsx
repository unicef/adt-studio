import { Trans } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import type { QuizItem } from "@/api/client"
import { CanvasViewportControls } from "./canvas/CanvasViewportControls"
import { PageEmptyState } from "./canvas/PageEmptyState"
import { QuizCanvas } from "./canvas/QuizCanvas"
import { EditorCanvas } from "./editor/EditorCanvas"
import { EditorEmpty, EditorError, EditorSkeleton } from "./editor/EditorStatus"
import type { SectioningRun } from "./runs/useSectioningRun"
import type { Viewport } from "./shared/types"
import type { PipelinePage } from "./shared/usePipelineState"
import type { StoryboardEditorSession } from "./editor/useStoryboardEditor"

export interface WorkspaceCanvasAreaProps {
  label: string
  activePage: PipelinePage | null
  activeQuiz: QuizItem | null
  quizVersion: number | null
  pages: PipelinePage[]
  session: StoryboardEditorSession
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  chromeHidden: boolean
  onToggleChrome: () => void
  sectioning: SectioningRun
  storyboardRunning: boolean
  onOpenSectioning: () => void
}

function CaptionsWarning() {
  return (
    <div className="flex w-full items-center gap-2 border-b border-amber-200 bg-amber-50 px-3.5 py-2 text-[12px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="size-3.5 shrink-0" />
      <Trans>This page has images without an alternative description.</Trans>
    </div>
  )
}

export function WorkspaceCanvasArea({
  label,
  activePage,
  activeQuiz,
  quizVersion,
  pages,
  session,
  viewport,
  onViewportChange,
  zoom,
  onZoomChange,
  chromeHidden,
  onToggleChrome,
  sectioning,
  storyboardRunning,
  onOpenSectioning,
}: WorkspaceCanvasAreaProps) {
  if (activeQuiz) {
    return (
      <>
        <QuizCanvas
          label={label}
          quiz={activeQuiz}
          version={quizVersion}
          pages={pages}
          viewport={viewport}
          zoom={zoom}
          onZoomChange={onZoomChange}
        />
        <CanvasViewportControls
          viewport={viewport}
          onViewportChange={onViewportChange}
          zoom={zoom}
          onZoomChange={onZoomChange}
          chromeHidden={chromeHidden}
          onToggleChrome={onToggleChrome}
        />
      </>
    )
  }

  if (session.status === "loading") return <EditorSkeleton />
  if (session.status === "error") return <EditorError message={session.error?.message} />
  if (!activePage) return <EditorEmpty />

  if (session.status === "ready") {
    return (
      <>
        {activePage.missingCaptions > 0 && <CaptionsWarning />}
        <EditorCanvas
          pageId={activePage.pageId}
          sections={session.sections}
          activeSectionIndex={session.activeSection?.sectionIndex ?? null}
          onSelectSection={session.selectSection}
          viewport={viewport}
          onViewportChange={onViewportChange}
        />
      </>
    )
  }

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center px-6 pb-24">
      <PageEmptyState
        label={label}
        page={activePage}
        sectioning={sectioning}
        storyboardRunning={storyboardRunning}
        onOpenSectioning={onOpenSectioning}
      />
    </div>
  )
}
