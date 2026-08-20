import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
} from "@/components/app/screens/pipeline/settings/slugs"
import { isDockSlug } from "./plugins"

export interface PipelineNavigation {
  /** The canvas, on whichever page it was last showing. */
  openWorkspace: () => void
  openPage: (pageId: string) => void
  openStep: (slug: string) => void
  openStepSettings: (slug: string) => void
  openSettingsTab: (slug: string, tab: string) => void
  openPreview: (sectionId: string | null) => void
  /** Opens the preview straight on a bundle page the caller already resolved. */
  openPreviewHref: (href: string) => void
  openBookInfo: () => void
}

export function usePipelineNavigation(label: string): PipelineNavigation {
  const navigate = useNavigate()

  return useMemo(() => {
    const openWorkspace = () => {
      void navigate({ to: "/pipeline/$label", params: { label } })
    }

    const openStep = (slug: string) => {
      if (!isDockSlug(slug)) return
      void navigate({ to: "/pipeline/$label/$step", params: { label, step: slug } })
    }

    const openSettingsTab = (slug: string, tab: string) => {
      if (!isStepSettingsSlug(slug)) return
      void navigate({
        to: "/pipeline/$label/$step/settings/$tab",
        params: { label, step: slug, tab },
      })
    }

    return {
      openWorkspace,
      openStep,
      openSettingsTab,

      // Replaces rather than pushes: the arrow keys walk the rail one page at a
      // time, and a history entry per keypress would bury whatever came before.
      openPage: (pageId: string) => {
        void navigate({
          to: "/pipeline/$label/pages/$pageId",
          params: { label, pageId },
          replace: true,
        })
      },

      openStepSettings: (slug: string) => {
        if (!isStepSettingsSlug(slug)) {
          openStep(slug)
          return
        }
        openSettingsTab(slug, defaultStepSettingsTab(slug, i18n))
      },

      openPreview: (sectionId: string | null) => {
        void navigate({
          to: "/pipeline/$label/preview",
          params: { label },
          search: sectionId ? { section: sectionId } : {},
        })
      },
      openPreviewHref: (href: string) => {
        void navigate({ to: "/pipeline/$label/preview", params: { label }, search: { href } })
      },

      openBookInfo: () => {
        void navigate({ to: "/pipeline/$label/info", params: { label } })
      },
    }
  }, [navigate, label])
}
