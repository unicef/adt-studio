import {
  Languages,
  Palette,
  Bell,
  Sparkles,
  Brain,
  ScrollText,
  Info,
  type LucideIcon,
} from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export const SETTINGS_PATHS = {
  language: "/redesign/settings/language",
  theme: "/redesign/settings/theme",
  notifications: "/redesign/settings/notifications",
  providers: "/redesign/settings/providers",
  models: "/redesign/settings/models",
  prompts: "/redesign/settings/prompts",
  about: "/redesign/settings/about",
} as const

export type SettingsSection = keyof typeof SETTINGS_PATHS

export interface SettingsTab {
  key: SettingsSection
  label: MessageDescriptor
  icon: LucideIcon
  fullWidth?: boolean
}

export interface SettingsGroup {
  key: string
  label: MessageDescriptor
  tabs: SettingsTab[]
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: "preferences",
    label: msg`Preferences`,
    tabs: [
      { key: "language", label: msg`Language`, icon: Languages },
      { key: "theme", label: msg`Appearance`, icon: Palette },
      { key: "notifications", label: msg`Notifications`, icon: Bell },
    ],
  },
  {
    key: "ai",
    label: msg`Artificial intelligence`,
    tabs: [
      { key: "providers", label: msg`AI providers`, icon: Sparkles },
      { key: "models", label: msg`Models`, icon: Brain },
      { key: "prompts", label: msg`Prompts`, icon: ScrollText, fullWidth: true },
    ],
  },
  {
    key: "application",
    label: msg`Application`,
    tabs: [{ key: "about", label: msg`About`, icon: Info }],
  },
]

export const SETTINGS_TABS: SettingsTab[] = SETTINGS_GROUPS.flatMap((group) => group.tabs)

export const SETTINGS_TAB_BY_KEY = Object.fromEntries(
  SETTINGS_TABS.map((tab) => [tab.key, tab]),
) as Record<SettingsSection, SettingsTab>

export const SETTINGS_ANCHORS = {
  themeMode: "settings-theme-mode",
  reduceMotion: "settings-reduce-motion",
  notificationPosition: "settings-notification-position",
  notificationSound: "settings-notification-sound",
  notificationAutoDismiss: "settings-notification-auto-dismiss",
  notificationTest: "settings-notification-test",
  defaultLlm: "settings-default-llm",
  imageModel: "settings-image-model",
  speechModel: "settings-speech-model",
  appVersion: "settings-app-version",
  booksFolder: "settings-books-folder",
  diagnostics: "settings-diagnostics",
} as const

export const localeAnchor = (locale: string) => `settings-locale-${locale}`
export const providerAnchor = (provider: string) => `settings-provider-${provider}`

export function activeSettingsTab(pathname: string): SettingsTab {
  return (
    SETTINGS_TABS.find((tab) => pathname.startsWith(SETTINGS_PATHS[tab.key])) ?? SETTINGS_TABS[0]
  )
}
