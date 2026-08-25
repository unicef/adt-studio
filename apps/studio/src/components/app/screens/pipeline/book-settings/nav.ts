import {
  Brain,
  BookMarked,
  Eye,
  ImageIcon,
  KeyRound,
  LayoutTemplate,
  Puzzle,
  SlidersHorizontal,
  Type,
  Wand2,
  type LucideIcon,
} from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { SETTINGS_TAB_MESSAGE } from "@/components/pipeline/settings-tabs"
import type { BookSettingsScope } from "./sections"

export {
  DEFAULT_BOOK_SETTINGS_SECTION,
  DEFAULT_STORYBOARD_SETTINGS_SECTION,
  bookSettingsScope,
  isBookSettingsSection,
  storyboardTabSection,
  type BookSettingsScope,
} from "./sections"

export interface BookSettingsSection {
  key: string
  label: MessageDescriptor
  icon: LucideIcon
  scope: BookSettingsScope
}

export interface BookSettingsGroup {
  key: BookSettingsScope
  label: MessageDescriptor
  sections: BookSettingsSection[]
}

export const BOOK_SETTINGS_GROUPS: BookSettingsGroup[] = [
  {
    key: "book",
    label: msg`Book`,
    sections: [
      {
        key: "information",
        label: SETTINGS_TAB_MESSAGE.information,
        icon: BookMarked,
        scope: "book",
      },
      { key: "api-keys", label: SETTINGS_TAB_MESSAGE["api-keys"], icon: KeyRound, scope: "book" },
      { key: "models", label: SETTINGS_TAB_MESSAGE.models, icon: Brain, scope: "book" },
    ],
  },
  {
    key: "storyboard",
    label: msg`Storyboard`,
    sections: [
      {
        key: "general",
        label: SETTINGS_TAB_MESSAGE.general,
        icon: SlidersHorizontal,
        scope: "storyboard",
      },
      { key: "fonts", label: SETTINGS_TAB_MESSAGE.fonts, icon: Type, scope: "storyboard" },
      {
        key: "rendering-prompt",
        label: SETTINGS_TAB_MESSAGE["rendering-prompt"],
        icon: Wand2,
        scope: "storyboard",
      },
      {
        key: "rendering-template",
        label: SETTINGS_TAB_MESSAGE["rendering-template"],
        icon: LayoutTemplate,
        scope: "storyboard",
      },
      {
        key: "activity-prompts",
        label: SETTINGS_TAB_MESSAGE["activity-prompts"],
        icon: Puzzle,
        scope: "storyboard",
      },
      {
        key: "image-generation",
        label: SETTINGS_TAB_MESSAGE["image-generation"],
        icon: ImageIcon,
        scope: "storyboard",
      },
      {
        key: "visual-review-prompt",
        label: SETTINGS_TAB_MESSAGE["visual-review-prompt"],
        icon: Eye,
        scope: "storyboard",
      },
    ],
  },
]

export const BOOK_SETTINGS_SECTIONS: BookSettingsSection[] = BOOK_SETTINGS_GROUPS.flatMap(
  (group) => group.sections,
)

export const BOOK_SETTINGS_SECTION_BY_KEY: Record<string, BookSettingsSection> =
  Object.fromEntries(BOOK_SETTINGS_SECTIONS.map((section) => [section.key, section]))
