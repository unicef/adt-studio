import { useNavigate } from "@tanstack/react-router"
import type { I18n } from "@lingui/core"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
  type StepSettingsSlug,
} from "@/components/app/screens/pipeline/settings/slugs"
import { isDockSlug, type DockSlug } from "./plugins"

export interface PipelineNavigationOptions {
  label: string
  stepSlug: DockSlug | undefined
  settingsSlug: StepSettingsSlug | undefined
  /** Page the canvas is on. Carried through every other navigation so stepping
   *  into a plugin, its settings or the preview and coming back lands on it. */
  pageId: string | undefined
  i18n: I18n
}

export interface PipelineNavigation {
  openStep: (slug: string) => void
  closeStep: () => void
  openSettings: (slug: string) => void
  closeSettings: () => void
  selectSettingsTab: (nextTab: string) => void
  selectPage: (pageId: string) => void
  openPreview: (sectionId: string | null) => void
  /** Opens the preview straight on a bundle page the caller already resolved. */
  openPreviewHref: (href: string) => void
  closePreview: () => void
  openBookInfo: () => void
  closeBookInfo: () => void
}

export function usePipelineNavigation({
  label,
  stepSlug,
  settingsSlug,
  pageId,
  i18n,
}: PipelineNavigationOptions): PipelineNavigation {
  const navigate = useNavigate()
  const page = pageId ? { page: pageId } : {}

  const openStep = (slug: string) => {
    if (!isDockSlug(slug)) return
    const keepSettings = settingsSlug && isStepSettingsSlug(slug)
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: keepSettings
        ? { step: slug, settings: slug, tab: defaultStepSettingsTab(slug, i18n), ...page }
        : { step: slug, ...page },
    })
  }
  const closeStep = () => {
    navigate({ to: "/pipeline/$label", params: { label }, search: { ...page } })
  }
  const openSettings = (slug: string) => {
    if (!isStepSettingsSlug(slug)) return
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: {
        ...(stepSlug ? { step: stepSlug } : {}),
        settings: slug,
        tab: defaultStepSettingsTab(slug, i18n),
        ...page,
      },
    })
  }
  const closeSettings = () => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: { ...(stepSlug ? { step: stepSlug } : {}), ...page },
    })
  }
  const selectSettingsTab = (nextTab: string) => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: {
        ...(stepSlug ? { step: stepSlug } : {}),
        settings: settingsSlug,
        tab: nextTab,
        ...page,
      },
    })
  }

  // Replaces rather than pushes: the arrow keys walk the rail one page at a
  // time, and a history entry per keypress would bury whatever came before.
  const selectPage = (nextPageId: string) => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: { ...(stepSlug ? { step: stepSlug } : {}), page: nextPageId },
      replace: true,
    })
  }

  const openPreview = (sectionId: string | null) => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: { preview: true, ...(sectionId ? { previewSection: sectionId } : {}), ...page },
    })
  }
  const openPreviewHref = (href: string) => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: { preview: true, previewHref: href, ...page },
    })
  }
  const closePreview = () => {
    navigate({ to: "/pipeline/$label", params: { label }, search: { ...page } })
  }

  const openBookInfo = () => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: { ...(stepSlug ? { step: stepSlug } : {}), info: true, ...page },
    })
  }
  const closeBookInfo = () => {
    navigate({
      to: "/pipeline/$label",
      params: { label },
      search: { ...(stepSlug ? { step: stepSlug } : {}), ...page },
    })
  }

  return {
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
  }
}
