import { getRouteApi } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { usePageTitle } from "@/hooks/use-page-title"
import { ScreenFallback } from "@/components/redesign/shared/ui/ScreenFallback"
import { PipelineWorkspace } from "./PipelineWorkspace"
import { PreviewScreen } from "./pipeline/preview/PreviewScreen"
import { StepSettingsScreen } from "./pipeline/settings/StepSettingsScreen"
import { defaultStepSettingsTab } from "./pipeline/settings/slugs"
import { STEP_VIEWS, type StepFrame } from "./pipeline/steps"
import { findDockEntry, isDockSlug, type DockSlug } from "./pipeline/shared/plugins"
import { usePipelineNavigation } from "./pipeline/shared/usePipelineNavigation"
import { usePipelineState } from "./pipeline/shared/usePipelineState"
import { useRunActivity, useStageActivity } from "./pipeline/runs/useRunActivity"
import { useSectioningRun } from "./pipeline/runs/useSectioningRun"
import { useStoryboardRun } from "./pipeline/runs/useStoryboardRun"

const route = getRouteApi("/redesign/pipeline/$label")

export function PipelineScreen() {
  const { label } = route.useParams()
  const {
    step: stepSlug,
    settings: settingsSlug,
    tab,
    page: pageId,
    preview,
    previewSection,
  } = route.useSearch()
  const { i18n } = useLingui()

  const state = usePipelineState(label)
  const run = useRunActivity()
  const extractActivity = useStageActivity("extract")
  const sectioningActivity = useStageActivity("sectioning")
  const storyboardActivity = useStageActivity("storyboard")
  const sectioningRun = useSectioningRun(label)
  const storyboardRun = useStoryboardRun(label)

  usePageTitle(state.book?.title ?? label)

  const {
    openStep,
    closeStep,
    openSettings,
    closeSettings,
    selectSettingsTab,
    selectPage,
    openPreview,
    closePreview,
  } = usePipelineNavigation({ label, stepSlug, settingsSlug, pageId, i18n })

  if (state.isLoading || state.error || !state.book) {
    return <ScreenFallback error={state.error} />
  }

  if (preview) {
    return (
      <PreviewScreen
        label={label}
        targetSectionId={previewSection ?? null}
        onBack={closePreview}
      />
    )
  }

  if (settingsSlug) {
    return (
      <StepSettingsScreen
        key={settingsSlug}
        label={label}
        slug={settingsSlug}
        tab={tab ?? defaultStepSettingsTab(settingsSlug, i18n)}
        foundations={state.foundations}
        plugins={state.plugins}
        onClose={closeSettings}
        onSelectTab={selectSettingsTab}
        onOpenPlugin={openStep}
      />
    )
  }

  const activeStep = stepSlug ? findDockEntry(stepSlug) : undefined

  if (activeStep && isDockSlug(activeStep.slug)) {
    const slug: DockSlug = activeStep.slug
    const frame: StepFrame = {
      foundations: state.foundations,
      plugins: state.plugins,
      onBack: closeStep,
      onOpenPlugin: openStep,
      onOpenSettings: openSettings,
      extractDone: state.extractDone,
      hasSections: state.hasSections,
      sectionCount: state.sectionCount,
    }
    const StepView = STEP_VIEWS[slug]

    return (
      <StepView
        key={slug}
        label={label}
        plugin={{ ...activeStep, slug }}
        pages={state.pages}
        frame={frame}
      />
    )
  }

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
      navigationEnabled={!stepSlug && !settingsSlug && state.hasSections && state.hasRendering}
      pageId={pageId ?? null}
      onSelectPage={selectPage}
      onOpenStep={openStep}
      onOpenSettings={openSettings}
      onOpenPreview={openPreview}
    />
  )
}
