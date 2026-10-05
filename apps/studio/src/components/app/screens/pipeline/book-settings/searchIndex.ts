import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
import type { LucideIcon } from "lucide-react"
import { STEP_SETTINGS_FIELDS } from "@/components/app/screens/pipeline/settings/searchIndex"
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
  anchor?: string
}

export interface BookSettingsSearchItem {
  id: string
  title: string
  sub?: string
  keywords?: string
  icon?: LucideIcon
  section: string
  anchor?: string
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

export const BOOK_INFO_ANCHORS = {
  title: "book-info-title",
  authors: "book-info-authors",
  publisher: "book-info-publisher",
  language: "book-info-language",
} as const

const OPTION_ENTRIES: BookSettingsSearchEntry[] = [
  {
    id: "book-info-title",
    section: "information",
    label: msg`Title`,
    keywords: msg`title name book`,
    anchor: BOOK_INFO_ANCHORS.title,
  },
  {
    id: "book-info-authors",
    section: "information",
    label: msg`Authors`,
    keywords: msg`author writer credits`,
    anchor: BOOK_INFO_ANCHORS.authors,
  },
  {
    id: "book-info-publisher",
    section: "information",
    label: msg`Publisher`,
    keywords: msg`publisher imprint`,
    anchor: BOOK_INFO_ANCHORS.publisher,
  },
  {
    id: "book-info-language",
    section: "information",
    label: msg`Original language`,
    hint: msg`Drives every language-dependent stage.`,
    keywords: msg`language locale region translation`,
    anchor: BOOK_INFO_ANCHORS.language,
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

// The storyboard's own fields are indexed once for the whole app; the hub shows
// them under the section whose key matches the stage tab they live in.
const STORYBOARD_FIELD_ENTRIES: BookSettingsSearchEntry[] = STEP_SETTINGS_FIELDS.filter(
  (field) => field.stage === "storyboard" && field.tab in BOOK_SETTINGS_SECTION_BY_KEY,
).map((field, index) => ({
  id: `book-storyboard-field-${index}`,
  section: field.tab,
  label: field.label,
  hint: field.hint,
  keywords: field.keywords,
  anchor: field.anchor,
}))

export const BOOK_SETTINGS_SEARCH_ENTRIES: BookSettingsSearchEntry[] = [
  ...SECTION_ENTRIES,
  ...OPTION_ENTRIES,
  ...STORYBOARD_FIELD_ENTRIES,
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
      anchor: entry.anchor,
    }
  })
}
