import { msg } from "@lingui/core/macro"
import type { I18n, MessageDescriptor } from "@lingui/core"
import { AudioLines, Brain, ImageIcon, type LucideIcon } from "lucide-react"
import { LOCALE_OPTIONS, THEME_OPTIONS } from "./options"
import { PROVIDER_IDS, PROVIDER_META } from "./providerSearchMeta"
import {
  SETTINGS_ANCHORS,
  SETTINGS_GROUPS,
  SETTINGS_TAB_BY_KEY,
  localeAnchor,
  providerAnchor,
  type SettingsSection,
} from "./nav"

export interface SettingsSearchEntry {
  id: string
  kind: "section" | "option"
  section: SettingsSection
  label: MessageDescriptor | string
  hint?: MessageDescriptor | string
  keywords?: MessageDescriptor
  anchor?: string
  icon?: LucideIcon
}

export interface SettingsSearchItem {
  id: string
  title: string
  sub?: string
  keywords?: string
  icon?: LucideIcon
  section: SettingsSection
  anchor?: string
}

export function settingsSearchText(i18n: I18n, value: MessageDescriptor | string): string {
  return typeof value === "string" ? value : i18n._(value)
}

export function buildSettingsSearchItems(
  i18n: I18n,
  entries: SettingsSearchEntry[],
): SettingsSearchItem[] {
  return entries.map((entry) => {
    const tab = SETTINGS_TAB_BY_KEY[entry.section]
    const sectionLabel = i18n._(tab.label)
    const hint = entry.hint ? settingsSearchText(i18n, entry.hint) : undefined
    return {
      id: entry.id,
      title: settingsSearchText(i18n, entry.label),
      sub: entry.kind === "section" ? hint : hint ? `${sectionLabel} · ${hint}` : sectionLabel,
      keywords: entry.keywords ? i18n._(entry.keywords) : undefined,
      icon: entry.icon ?? tab.icon,
      section: entry.section,
      anchor: entry.anchor,
    }
  })
}

const SECTION_KEYWORDS: Record<SettingsSection, MessageDescriptor> = {
  language: msg`language locale translation region`,
  theme: msg`theme appearance dark light colors interface`,
  notifications: msg`notifications toasts alerts sound`,
  providers: msg`providers api key credentials endpoint`,
  models: msg`models llm image speech`,
  prompts: msg`prompts templates instructions`,
  about: msg`about version update logs diagnostics`,
}

const SECTION_ENTRIES: SettingsSearchEntry[] = SETTINGS_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => ({
    id: `settings-section-${tab.key}`,
    kind: "section" as const,
    section: tab.key,
    label: tab.label,
    hint: group.label,
    keywords: SECTION_KEYWORDS[tab.key],
    icon: tab.icon,
  })),
)

const LANGUAGE_ENTRIES: SettingsSearchEntry[] = LOCALE_OPTIONS.map((locale) => ({
  id: `settings-language-${locale.key}`,
  kind: "option",
  section: "language",
  label: locale.name,
  hint: locale.native,
  anchor: localeAnchor(locale.key),
}))

const THEME_ENTRIES: SettingsSearchEntry[] = [
  ...THEME_OPTIONS.map<SettingsSearchEntry>((theme) => ({
    id: `settings-theme-${theme.key}`,
    kind: "option",
    section: "theme",
    label: theme.label,
    anchor: SETTINGS_ANCHORS.themeMode,
    icon: theme.icon,
  })),
  {
    id: "settings-theme-reduce-motion",
    kind: "option",
    section: "theme",
    label: msg`Reduce motion`,
    hint: msg`Minimise onboarding and list-reorder animations.`,
    keywords: msg`motion animation accessibility`,
    anchor: SETTINGS_ANCHORS.reduceMotion,
  },
]

const NOTIFICATION_ENTRIES: SettingsSearchEntry[] = [
  {
    id: "settings-notification-position",
    kind: "option",
    section: "notifications",
    label: msg`Position`,
    keywords: msg`position corner toast placement`,
    anchor: SETTINGS_ANCHORS.notificationPosition,
  },
  {
    id: "settings-notification-sound",
    kind: "option",
    section: "notifications",
    label: msg`Play a sound`,
    hint: msg`A soft chime when a long task completes.`,
    anchor: SETTINGS_ANCHORS.notificationSound,
  },
  {
    id: "settings-notification-auto-dismiss",
    kind: "option",
    section: "notifications",
    label: msg`Auto-dismiss`,
    hint: msg`Hide toasts automatically after a delay.`,
    anchor: SETTINGS_ANCHORS.notificationAutoDismiss,
  },
  {
    id: "settings-notification-test",
    kind: "option",
    section: "notifications",
    label: msg`Try it out`,
    hint: msg`Send a sample notification using these settings.`,
    anchor: SETTINGS_ANCHORS.notificationTest,
  },
]

const PROVIDER_ENTRIES: SettingsSearchEntry[] = PROVIDER_IDS.map((provider) => ({
  id: `settings-provider-${provider}`,
  kind: "option",
  section: "providers",
  label: PROVIDER_META[provider].name,
  hint: PROVIDER_META[provider].desc,
  keywords: PROVIDER_META[provider].hint,
  anchor: providerAnchor(provider),
  icon: PROVIDER_META[provider].icon,
}))

const MODEL_ENTRIES: SettingsSearchEntry[] = [
  {
    id: "settings-model-default-llm",
    kind: "option",
    section: "models",
    label: msg`Default LLM`,
    hint: msg`Every text task falls back to this model unless it overrides it.`,
    anchor: SETTINGS_ANCHORS.defaultLlm,
    icon: Brain,
  },
  {
    id: "settings-model-image",
    kind: "option",
    section: "models",
    label: msg`Image generation and editing`,
    hint: msg`AI image generation and editing.`,
    anchor: SETTINGS_ANCHORS.imageModel,
    icon: ImageIcon,
  },
  {
    id: "settings-model-speech",
    kind: "option",
    section: "models",
    label: msg`Speech generation`,
    hint: msg`OpenAI, Azure, and Gemini text-to-speech.`,
    anchor: SETTINGS_ANCHORS.speechModel,
    icon: AudioLines,
  },
]

const ABOUT_ENTRIES: SettingsSearchEntry[] = [
  {
    id: "settings-about-updates",
    kind: "option",
    section: "about",
    label: msg`Check for updates`,
    keywords: msg`version update release`,
    anchor: SETTINGS_ANCHORS.appVersion,
  },
  {
    id: "settings-about-books-folder",
    kind: "option",
    section: "about",
    label: msg`Books folder`,
    hint: msg`Where book projects live on this machine.`,
    anchor: SETTINGS_ANCHORS.booksFolder,
  },
  {
    id: "settings-about-diagnostics",
    kind: "option",
    section: "about",
    label: msg`Diagnostics`,
    hint: msg`Logs help us debug pipeline failures.`,
    anchor: SETTINGS_ANCHORS.diagnostics,
  },
]

export const SETTINGS_SECTION_ENTRIES: SettingsSearchEntry[] = SECTION_ENTRIES

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  ...SECTION_ENTRIES,
  ...LANGUAGE_ENTRIES,
  ...THEME_ENTRIES,
  ...NOTIFICATION_ENTRIES,
  ...PROVIDER_ENTRIES,
  ...MODEL_ENTRIES,
  ...ABOUT_ENTRIES,
]
