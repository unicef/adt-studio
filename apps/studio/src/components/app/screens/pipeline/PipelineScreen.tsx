import { getRouteApi } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { usePageTitle } from "@/hooks/use-page-title"
import { ScreenFallback } from "@/components/app/ui/ScreenFallback"
import { PipelineWorkspace } from "./PipelineWorkspace"
import { BookInfoScreen } from "./info/BookInfoScreen"
import { PreviewScreen } from "./preview/PreviewScreen"
import { StepSettingsScreen } from "./settings/StepSettingsScreen"
import { defaultStepSettingsTab } from "./settings/slugs"
import { STEP_VIEWS, type StepFrame } from "./steps"
import { findDockEntry, isDockSlug, type DockSlug } from "./shared/plugins"
import { usePipelineNavigation } from "./shared/usePipelineNavigation"
import { usePipelineState } from "./shared/usePipelineState"
import { useRunActivity, useStageActivity } from "./runs/useRunActivity"
import { useSectioningRun } from "./runs/useSectioningRun"
import { useStoryboardRun } from "./runs/useStoryboardRun"

const route = getRouteApi("/_app/pipeline/$label")

export function PipelineScreen() {
  const { label } = route.useParams()
  const {
    step: stepSlug,
    settings: settingsSlug,
    tab,
    page: pageId,
    preview,
    previewSection,
    previewHref,
    info,
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
    openPreviewHref,
    closePreview,
    openBookInfo,
    closeBookInfo,
  } = usePipelineNavigation({ label, stepSlug, settingsSlug, pageId, i18n })

  if (state.isLoading || state.error || !state.book) {
    return <ScreenFallback error={state.error} />
  }

  if (info) {
    return <BookInfoScreen label={label} onBack={closeBookInfo} />
  }

  if (preview) {
    return (
      <PreviewScreen
        label={label}
        targetSectionId={previewSection ?? null}
        targetHref={previewHref ?? null}
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
      onOpenPreview: openPreview,
      onOpenPreviewHref: openPreviewHref,
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
      onOpenBookInfo={openBookInfo}
    />
  )
}
