/**
 * App config atoms — backed by `assets/config.json` fetched on boot.
 * The shape mirrors what the legacy runtime stashed on `window.appConfig`.
 */
import { ephemeralAtom } from "@/shared/state/persist"

export interface AppFeatures {
  signLanguage?: boolean
  easyRead?: boolean
  glossary?: boolean
  eli5?: boolean
  readAloud?: boolean
  autoplay?: boolean
  showTutorial?: boolean
  showNavigationControls?: boolean
  describeImages?: boolean
  notepad?: boolean
  showAutoHideButton?: boolean
  characterDisplay?: boolean
  highlight?: boolean
  activities?: boolean
  state?: boolean
  kidsMode?: boolean
  /** Buddy roster packed by Studio; empty/absent means all built-ins. */
  kidsBuddies?: string[]
  /**
   * Opt into cookie-backed atom persistence instead of the default
   * `localStorage`. Use only for legacy multi-book deployments on a shared
   * origin where path-scoped cookies are needed to isolate titles.
   */
  cookieStorage?: boolean
}

export interface AppLanguages {
  available: string[]
  default: string
}

export interface AppAnalytics {
  enabled: boolean
  siteId?: number
  trackerUrl?: string
  srcUrl?: string
}

export type LockableSetting = "dockLayout" | "theme" | "iconSize" | "reduceMotion"

export interface DefaultSettings {
  dockLayout?: {
    width?: "compact" | "full"
    position?: "top" | "bottom"
    align?: "center" | "spread"
  }
  theme?: "light" | "dark" | "system"
  iconSize?: "sm" | "md" | "lg"
  reduceMotion?: boolean
}

export interface AppConfig {
  title?: string
  shortTitle?: string
  author?: string
  cover?: string
  bundleVersion?: string
  languages: AppLanguages
  features: AppFeatures
  analytics?: AppAnalytics
  defaultSettings?: DefaultSettings
  lockedSettings?: LockableSetting[]
}

const DEFAULT_CONFIG: AppConfig = {
  languages: { available: ["en"], default: "en" },
  features: {},
}

export const appConfigAtom = ephemeralAtom<AppConfig>(DEFAULT_CONFIG)

export function isSettingLocked(
  config: AppConfig,
  key: LockableSetting,
): boolean {
  return config.lockedSettings?.includes(key) === true
}
