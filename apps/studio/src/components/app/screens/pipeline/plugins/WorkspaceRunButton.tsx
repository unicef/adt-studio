import { StageRerunButton } from "@/components/app/screens/pipeline/runs/StageRerunButton"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import type { DockSlug } from "@/components/app/screens/pipeline/shared/plugins"

export interface WorkspaceRunButtonProps {
  label: string
  slug: DockSlug
}

export function WorkspaceRunButton({ label, slug }: WorkspaceRunButtonProps) {
  const rerun = useStageRerun(label, slug)
  return <StageRerunButton slug={slug} rerun={rerun} />
}
