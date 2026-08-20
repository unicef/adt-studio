import { createFileRoute, redirect } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
} from "@/components/app/screens/pipeline/settings/slugs"

export const Route = createFileRoute("/_app/pipeline/$label/$step/settings/")({
  // Settings always sit on a tab. Opening them bare resolves the default, which
  // is never Overview — the gear means "configure".
  beforeLoad: ({ params }) => {
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
