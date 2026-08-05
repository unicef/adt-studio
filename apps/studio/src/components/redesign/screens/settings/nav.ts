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

export const SETTINGS_TABS: SettingsTab[] = [
  { key: "language", label: msg`Language`, icon: Languages },
  { key: "theme", label: msg`Theme`, icon: Palette },
  { key: "notifications", label: msg`Notifications`, icon: Bell },
  { key: "providers", label: msg`AI providers`, icon: Sparkles },
  { key: "models", label: msg`Models`, icon: Brain },
  { key: "prompts", label: msg`Prompts`, icon: ScrollText, fullWidth: true },
  { key: "about", label: msg`About`, icon: Info },
]

export function activeSettingsTab(pathname: string): SettingsTab {
  return (
    SETTINGS_TABS.find((tab) => pathname.startsWith(SETTINGS_PATHS[tab.key])) ?? SETTINGS_TABS[0]
  )
}
