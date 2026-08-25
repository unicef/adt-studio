import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { i18n } from "@lingui/core"
import {
  DEFAULT_BOOK_SETTINGS_SECTION,
  DEFAULT_STORYBOARD_SETTINGS_SECTION,
  storyboardTabSection,
} from "@/components/app/screens/pipeline/book-settings/sections"
import {
  defaultStepSettingsTab,
  isStepSettingsSlug,
} from "@/components/app/screens/pipeline/settings/slugs"
import { isDockSlug } from "./plugins"

export interface PipelineNavigation {
  openWorkspace: () => void
  openPage: (pageId: string) => void
  openStep: (slug: string) => void
  openStepSettings: (slug: string) => void
  openSettingsTab: (slug: string, tab: string) => void
  openPreview: (sectionId: string | null) => void
  openPreviewHref: (href: string) => void
  openBookInfo: () => void
  openBookSettings: (section: string) => void
}

export function usePipelineNavigation(label: string): PipelineNavigation {
  const navigate = useNavigate()

  return useMemo(() => {
    const openWorkspace = () => {
      void navigate({ to: "/pipeline/$label", params: { label } })
    }

    // `search: true` carries the current search (e.g. the open `page`) into the
    // next step, so switching steps keeps the page the user was working on.
    const openStep = (slug: string) => {
      if (!isDockSlug(slug)) return
      void navigate({ to: "/pipeline/$label/$step", params: { label, step: slug }, search: true })
    }

    const openBookSettings = (section: string) => {
      void navigate({
        to: "/pipeline/$label/settings/$section",
        params: { label, section },
      })
    }

    // Storyboard is the workspace itself, so its settings live in the book
    // settings hub rather than behind a step screen.
    const openSettingsTab = (slug: string, tab: string) => {
      if (slug === "storyboard") {
        openBookSettings(storyboardTabSection(tab))
        return
      }
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
      openBookSettings,

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
        if (slug === "storyboard") {
          openBookSettings(DEFAULT_STORYBOARD_SETTINGS_SECTION)
          return
        }
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
        openBookSettings(DEFAULT_BOOK_SETTINGS_SECTION)
      },
    }
  }, [navigate, label])
}
