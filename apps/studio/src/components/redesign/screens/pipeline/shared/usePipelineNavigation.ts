import { useNavigate } from "@tanstack/react-router"
import type { I18n } from "@lingui/core"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
  type StepSettingsSlug,
} from "@/components/redesign/screens/pipeline/settings/slugs"
import { isDockSlug, type DockSlug } from "./plugins"

export interface PipelineNavigationOptions {
  label: string
  stepSlug: DockSlug | undefined
  settingsSlug: StepSettingsSlug | undefined
  i18n: I18n
}

export interface PipelineNavigation {
  openStep: (slug: string) => void
  closeStep: () => void
  openSettings: (slug: string) => void
  closeSettings: () => void
  selectSettingsTab: (nextTab: string) => void
}

export function usePipelineNavigation({
  label,
  stepSlug,
  settingsSlug,
  i18n,
}: PipelineNavigationOptions): PipelineNavigation {
  const navigate = useNavigate()

  const openStep = (slug: string) => {
    if (!isDockSlug(slug)) return
    const keepSettings = settingsSlug && isStepSettingsSlug(slug)
    navigate({
      to: "/redesign/pipeline/$label",
      params: { label },
      search: keepSettings
        ? { step: slug, settings: slug, tab: defaultStepSettingsTab(slug, i18n) }
        : { step: slug },
    })
  }
  const closeStep = () => {
    navigate({ to: "/redesign/pipeline/$label", params: { label }, search: {} })
  }
  const openSettings = (slug: string) => {
    if (!isStepSettingsSlug(slug)) return
    navigate({
      to: "/redesign/pipeline/$label",
      params: { label },
      search: {
        ...(stepSlug ? { step: stepSlug } : {}),
        settings: slug,
        tab: defaultStepSettingsTab(slug, i18n),
      },
    })
  }
  const closeSettings = () => {
    navigate({
      to: "/redesign/pipeline/$label",
      params: { label },
      search: stepSlug ? { step: stepSlug } : {},
    })
  }
  const selectSettingsTab = (nextTab: string) => {
    navigate({
      to: "/redesign/pipeline/$label",
      params: { label },
      search: { ...(stepSlug ? { step: stepSlug } : {}), settings: settingsSlug, tab: nextTab },
    })
  }

  return { openStep, closeStep, openSettings, closeSettings, selectSettingsTab }
}
