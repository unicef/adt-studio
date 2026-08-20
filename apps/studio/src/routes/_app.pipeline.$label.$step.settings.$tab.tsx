import { createFileRoute, redirect } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import { StepSettingsScreen } from "@/components/app/screens/pipeline/settings/StepSettingsScreen"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
  stepSettingsTabs,
} from "@/components/app/screens/pipeline/settings/slugs"
import { isDockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { usePipelineState } from "@/components/app/screens/pipeline/shared/usePipelineState"

export const Route = createFileRoute("/_app/pipeline/$label/$step/settings/$tab")({
  beforeLoad: ({ params }) => {
    if (!isStepSettingsSlug(params.step)) {
      throw redirect({
        to: "/pipeline/$label/$step",
        params: { label: params.label, step: params.step },
        replace: true,
      })
    }
    // Overview is included here even though it only earns a tab once the stage
    // has output — whether it is reachable depends on the live run state, which
    // this guard cannot see. The screen falls back on its own when it is not.
    const tabs = stepSettingsTabs(params.step, i18n, true)
    if (tabs.length > 0 && !tabs.some((tab) => tab.key === params.tab)) {
      throw redirect({
        to: "/pipeline/$label/$step/settings/$tab",
        params: {
          label: params.label,
          step: params.step,
          tab: defaultStepSettingsTab(params.step, i18n),
        },
        replace: true,
      })
    }
  },
  component: StepSettingsRoute,
})

function StepSettingsRoute() {
  const { label, step, tab } = Route.useParams()
  const state = usePipelineState(label)
  const nav = usePipelineNavigation(label)

  if (!isStepSettingsSlug(step)) return null

  return (
    <StepSettingsScreen
      key={step}
      label={label}
      slug={step}
      tab={tab}
      foundations={state.foundations}
      plugins={state.plugins}
      onClose={() => (isDockSlug(step) ? nav.openStep(step) : nav.openWorkspace())}
      onSelectTab={(next) => nav.openSettingsTab(step, next)}
      onOpenPlugin={nav.openStepSettings}
    />
  )
}
