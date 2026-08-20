import { useEffect } from "react"
import { PipelineWorkspace } from "./PipelineWorkspace"
import { usePipelineNavigation } from "./shared/usePipelineNavigation"
import { usePipelineState } from "./shared/usePipelineState"
import { rememberLastPage } from "./shared/workspacePrefs"
import { useRunActivity, useStageActivity } from "./runs/useRunActivity"
import { useSectioningRun } from "./runs/useSectioningRun"
import { useStoryboardRun } from "./runs/useStoryboardRun"

export interface WorkspaceScreenProps {
  label: string
  /** Null only while the book has no pages yet — the canvas shows its empty state. */
  pageId: string | null
}

export function WorkspaceScreen({ label, pageId }: WorkspaceScreenProps) {
  const state = usePipelineState(label)
  const run = useRunActivity()
  const extractActivity = useStageActivity("extract")
  const sectioningActivity = useStageActivity("sectioning")
  const storyboardActivity = useStageActivity("storyboard")
  const sectioningRun = useSectioningRun(label)
  const storyboardRun = useStoryboardRun(label)
  const nav = usePipelineNavigation(label)

  useEffect(() => {
    if (pageId) rememberLastPage(label, pageId)
  }, [label, pageId])

  return (
    <PipelineWorkspace
      label={label}
      state={state}
      run={run}
      extractActivity={extractActivity}
      sectioningActivity={sectioningActivity}
      storyboardActivity={storyboardActivity}
      sectioningRun={sectioningRun}
      storyboardRun={storyboardRun}
      navigationEnabled={state.hasSections && state.hasRendering}
      pageId={pageId}
      onSelectPage={nav.openPage}
      onOpenStep={nav.openStep}
      onOpenSettings={nav.openStepSettings}
      onOpenPreview={nav.openPreview}
      onOpenBookInfo={nav.openBookInfo}
    />
  )
}
