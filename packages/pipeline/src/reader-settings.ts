import type { AppConfig } from "@adt/types"

import type { PackageAdtWebOptions } from "./packaging/web.js"

/**
 * The book config's reader settings (`default_settings`, `locked_settings`) in
 * the shape the reader's config.json uses. Shared by the export and by the
 * Studio preview: the preview reports its settings back and the export lets
 * them override the book's, so both must start from the same values (#1198).
 */
export function readerSettingsFromConfig(
  config: Pick<AppConfig, "default_settings" | "locked_settings">,
): Pick<PackageAdtWebOptions, "defaultSettings" | "lockedSettings"> {
  const settings = config.default_settings
  const defaultSettings = settings
    ? {
        ...(settings.dock_layout ? { dockLayout: settings.dock_layout } : {}),
        ...(settings.theme !== undefined ? { theme: settings.theme } : {}),
        ...(settings.icon_size !== undefined ? { iconSize: settings.icon_size } : {}),
        ...(settings.reduce_motion !== undefined ? { reduceMotion: settings.reduce_motion } : {}),
      }
    : undefined
  return {
    ...(defaultSettings && Object.keys(defaultSettings).length > 0 ? { defaultSettings } : {}),
    ...(config.locked_settings && config.locked_settings.length > 0
      ? { lockedSettings: config.locked_settings }
      : {}),
  }
}
