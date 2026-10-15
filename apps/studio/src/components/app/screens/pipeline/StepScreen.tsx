import { STEP_VIEWS, type StepFrame } from "./steps"
import { findDockEntry, type DockSlug } from "./shared/plugins"
import { usePipelineNavigation } from "./shared/usePipelineNavigation"
import { usePipelineState } from "./shared/usePipelineState"
import { StepEmpty } from "./steps/shared/StepShell"
import { isHiddenByJourney, useScenario } from "@/components/app/lab/simulate"

export interface StepScreenProps {
  label: string
  slug: DockSlug
}

export function StepScreen({ label, slug }: StepScreenProps) {
  const state = usePipelineState(label)
  const nav = usePipelineNavigation(label)
  const entry = findDockEntry(slug)
  useScenario()

  if (!entry) return null

  const frame: StepFrame = {
    foundations: state.foundations,
    plugins: state.plugins,
    onBack: nav.openWorkspace,
    onOpenPlugin: nav.openStep,
    onOpenSettings: nav.openStepSettings,
    onOpenPreview: nav.openPreview,
    onOpenPreviewHref: nav.openPreviewHref,
    extractDone: state.extractDone,
    hasSections: state.hasSections,
    sectionCount: state.sectionCount,
  }
  const StepView = STEP_VIEWS[slug]
  if (isHiddenByJourney(slug)) {
    return <StepEmpty key={slug} label={label} plugin={entry} pages={state.pages} frame={frame} />
  }

  return <StepView key={slug} label={label} plugin={entry} pages={state.pages} frame={frame} />
}
