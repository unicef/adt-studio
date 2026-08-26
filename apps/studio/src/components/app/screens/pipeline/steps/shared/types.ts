import type { DockEntry, DockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import type { DockItem, PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

export interface StepFrame {
  foundations: DockItem[]
  plugins: DockItem[]
  onBack: () => void
  onOpenPlugin: (slug: string) => void
  onOpenSettings: (slug: DockSlug) => void
  onOpenPreview: (sectionId: string | null) => void
  onOpenPreviewHref: (href: string) => void
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
