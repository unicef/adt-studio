import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react"
import type { AppLocale } from "@/i18n/locales"

export type ThemeMode = "light" | "dark" | "system"

export interface ThemeOption {
  key: ThemeMode
  label: MessageDescriptor
  icon: LucideIcon
  previewBg: string
  railBg: string
  hairline: string
  barStrong: string
  barSoft: string
  cardBg: string
  split: boolean
}

export const THEME_OPTIONS: ThemeOption[] = [
  { key: "light", label: msg`Light`, icon: Sun, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: false },
  { key: "dark", label: msg`Dark`, icon: Moon, previewBg: "#0f172a", railBg: "#1e293b", hairline: "#334155", barStrong: "#64748b", barSoft: "#334155", cardBg: "#1e293b", split: false },
  { key: "system", label: msg`System`, icon: Monitor, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: true },
]

export interface LocaleOption {
  key: AppLocale
  code: MessageDescriptor
  name: MessageDescriptor
  native: MessageDescriptor
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { key: "en", code: msg`EN`, name: msg`English`, native: msg`English` },
  { key: "pt-BR", code: msg`PT`, name: msg`Portuguese (BR)`, native: msg`Português (Brasil)` },
  { key: "es", code: msg`ES`, name: msg`Spanish`, native: msg`Español` },
  { key: "fr", code: msg`FR`, name: msg`French`, native: msg`Français` },
  { key: "sq", code: msg`SQ`, name: msg`Albanian`, native: msg`Shqip` },
]
