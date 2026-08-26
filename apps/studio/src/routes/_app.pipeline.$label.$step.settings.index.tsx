import { createFileRoute, redirect } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import { DEFAULT_STORYBOARD_SETTINGS_SECTION } from "@/components/app/screens/pipeline/book-settings/sections"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
} from "@/components/app/screens/pipeline/settings/slugs"

export const Route = createFileRoute("/_app/pipeline/$label/$step/settings/")({
  // Settings always sit on a tab. Opening them bare resolves the default, which
  // is never Overview — the gear means "configure".
  beforeLoad: ({ params }) => {
    if (params.step === "storyboard") {
      throw redirect({
        to: "/pipeline/$label/settings/$section",
        params: { label: params.label, section: DEFAULT_STORYBOARD_SETTINGS_SECTION },
        replace: true,
      })
    }
    if (!isStepSettingsSlug(params.step)) {
      throw redirect({
        to: "/pipeline/$label/$step",
        params: { label: params.label, step: params.step },
        replace: true,
      })
    }
    throw redirect({
      to: "/pipeline/$label/$step/settings/$tab",
      params: {
        label: params.label,
        step: params.step,
        tab: defaultStepSettingsTab(params.step, i18n),
      },
      replace: true,
    })
  },
})
