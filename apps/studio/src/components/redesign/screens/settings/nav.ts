import { Languages, Palette, Bell, Sparkles, Brain, Info, type LucideIcon } from "lucide-react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export const SETTINGS_PATHS = {
  language: "/redesign/settings/language",
  theme: "/redesign/settings/theme",
  notifications: "/redesign/settings/notifications",
  providers: "/redesign/settings/providers",
  models: "/redesign/settings/models",
  about: "/redesign/settings/about",
} as const

export type SettingsSection = keyof typeof SETTINGS_PATHS

export const SETTINGS_TABS: { key: SettingsSection; label: MessageDescriptor; icon: LucideIcon }[] = [
  { key: "language", label: msg`Language`, icon: Languages },
  { key: "theme", label: msg`Theme`, icon: Palette },
  { key: "notifications", label: msg`Notifications`, icon: Bell },
  { key: "providers", label: msg`AI providers`, icon: Sparkles },
  { key: "models", label: msg`Models`, icon: Brain },
  { key: "about", label: msg`About`, icon: Info },
]

export function activeSettingsSection(pathname: string): SettingsSection {
  return SETTINGS_TABS.find((tab) => pathname.startsWith(SETTINGS_PATHS[tab.key]))?.key ?? "language"
}
