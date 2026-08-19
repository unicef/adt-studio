import { StageRerunButton } from "@/components/redesign/screens/pipeline/runs/StageRerunButton"
import { useStageRerun } from "@/components/redesign/screens/pipeline/runs/useStageRerun"
import type { DockSlug } from "@/components/redesign/screens/pipeline/shared/plugins"

export interface WorkspaceRunButtonProps {
  label: string
  slug: DockSlug
}

export function WorkspaceRunButton({ label, slug }: WorkspaceRunButtonProps) {
  const rerun = useStageRerun(label, slug)
  return <StageRerunButton slug={slug} rerun={rerun} />
}
