/**
 * App config atoms — backed by `assets/config.json` fetched on boot.
 * The shape mirrors what the legacy runtime stashed on `window.appConfig`.
 */
import { ephemeralAtom } from "@/shared/state/persist"

export interface AppFeatures {
  signLanguage?: boolean
  easyRead?: boolean
  glossary?: boolean
  /**
   * Whether the export carries a second narrator (`audio_voices.json` and
   * `timecode/timecode_voices.json`). Only an explicit `false` skips those
   * requests: configs written before the flag existed don't say (#1157).
   */
  voiceVariants?: boolean
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
  /**
   * Pinned reviewer comments. Only ever set by the publish flow, which patches
   * it into the snapshot's `config.json`; a plain `adt` export never has it, so
   * the feature costs a downloaded book nothing.
   */
  comments?: boolean
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
