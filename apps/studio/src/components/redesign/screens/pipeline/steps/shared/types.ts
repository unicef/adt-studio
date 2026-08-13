import type { DockEntry, DockSlug } from "@/components/redesign/screens/pipeline/shared/plugins"
import type { DockItem, PipelinePage } from "@/components/redesign/screens/pipeline/shared/usePipelineState"

/** Everything the workspace frame needs, threaded through unchanged by each step. */
export interface StepFrame {
  foundations: DockItem[]
  plugins: DockItem[]
  onBack: () => void
  onOpenPlugin: (slug: string) => void
  onOpenSettings: (slug: DockSlug) => void
  extractDone: boolean
  hasSections: boolean
  sectionCount: number
}

export interface StepProps {
  label: string
  plugin: DockEntry & { slug: DockSlug }
  pages: PipelinePage[]
  frame: StepFrame
}
