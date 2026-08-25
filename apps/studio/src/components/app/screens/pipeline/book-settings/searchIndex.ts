import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
import type { LucideIcon } from "lucide-react"
import {
  BOOK_SETTINGS_GROUPS,
  BOOK_SETTINGS_SECTION_BY_KEY,
  type BookSettingsSection,
} from "./nav"

export interface BookSettingsSearchEntry {
  id: string
  section: string
  label: MessageDescriptor
  hint?: MessageDescriptor
  keywords?: MessageDescriptor
  icon?: LucideIcon
}

export interface BookSettingsSearchItem {
  id: string
  title: string
  sub?: string
  keywords?: string
  icon?: LucideIcon
  section: string
}

const SECTION_KEYWORDS: Record<string, MessageDescriptor> = {
  information: msg`title authors publisher language pages identifier metadata cover`,
  "api-keys": msg`api key credentials provider token openai gemini`,
  models: msg`model llm image speech default`,
  general: msg`layout strategy style guide rendering defaults`,
  fonts: msg`font typeface typography google fonts`,
  "rendering-prompt": msg`prompt ai rendering html section`,
  "rendering-template": msg`template fixed layout two column`,
  "activity-prompts": msg`activity interactive exercise rendering`,
  "image-generation": msg`image generation illustration prompt`,
  "visual-review-prompt": msg`visual review quality check`,
}

const OPTION_ENTRIES: BookSettingsSearchEntry[] = [
  {
    id: "book-info-title",
    section: "information",
    label: msg`Title`,
    keywords: msg`title name book`,
  },
  {
    id: "book-info-authors",
    section: "information",
    label: msg`Authors`,
    keywords: msg`author writer credits`,
  },
  {
    id: "book-info-publisher",
    section: "information",
    label: msg`Publisher`,
    keywords: msg`publisher imprint`,
  },
  {
    id: "book-info-language",
    section: "information",
    label: msg`Original language`,
    hint: msg`Drives every language-dependent stage.`,
    keywords: msg`language locale region translation`,
  },
  {
    id: "book-api-keys-credentials",
    section: "api-keys",
    label: msg`Provider credentials`,
    hint: msg`Shared by every book on this machine.`,
  },
]

const SECTION_ENTRIES: BookSettingsSearchEntry[] = BOOK_SETTINGS_GROUPS.flatMap((group) =>
  group.sections.map((section) => ({
    id: `book-settings-section-${section.key}`,
    section: section.key,
    label: section.label,
    hint: group.label,
    keywords: SECTION_KEYWORDS[section.key],
    icon: section.icon,
  })),
)

export const BOOK_SETTINGS_SEARCH_ENTRIES: BookSettingsSearchEntry[] = [
  ...SECTION_ENTRIES,
  ...OPTION_ENTRIES,
]

export function buildBookSettingsSearchItems(
  i18n: I18n,
  entries: BookSettingsSearchEntry[],
): BookSettingsSearchItem[] {
  return entries.map((entry) => {
    const section: BookSettingsSection | undefined = BOOK_SETTINGS_SECTION_BY_KEY[entry.section]
    const sectionLabel = section ? i18n._(section.label) : ""
    const hint = entry.hint ? i18n._(entry.hint) : undefined
    const isSection = entry.id.startsWith("book-settings-section-")
    return {
      id: entry.id,
      title: i18n._(entry.label),
      sub: isSection ? hint : hint ? `${sectionLabel} · ${hint}` : sectionLabel,
      keywords: entry.keywords ? i18n._(entry.keywords) : undefined,
      icon: entry.icon ?? section?.icon,
      section: entry.section,
    }
  })
}
