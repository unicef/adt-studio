import { z } from "zod"

/**
 * The reader's default and locked settings an export wrote into
 * assets/config.json, as the book config's `default_settings` and
 * `locked_settings` (#1198). The export writes them back from there, so an
 * imported book keeps them.
 *
 * Each value is checked on its own against what the book config accepts: a
 * value it doesn't accept is dropped, never guessed and never a reason to fail
 * the import.
 */
export interface ImportedReaderSettings {
  default_settings?: {
    dock_layout?: { width?: "compact" | "full"; position?: "top" | "bottom"; align?: "center" | "spread" }
    theme?: "light" | "dark" | "system"
    icon_size?: "sm" | "md" | "lg"
    reduce_motion?: boolean
  }
  locked_settings?: Array<"dockLayout" | "theme" | "iconSize" | "reduceMotion">
}

const DOCK_FIELDS = {
  width: z.enum(["compact", "full"]),
  position: z.enum(["top", "bottom"]),
  align: z.enum(["center", "spread"]),
}
const Theme = z.enum(["light", "dark", "system"])
const IconSize = z.enum(["sm", "md", "lg"])
const LockedSetting = z.enum(["dockLayout", "theme", "iconSize", "reduceMotion"])

export function importedReaderSettings(runtimeConfig: unknown): ImportedReaderSettings {
  const config = asRecord(runtimeConfig)
  const defaults = asRecord(config?.defaultSettings)
  const result: ImportedReaderSettings = {}

  if (defaults) {
    const settings: NonNullable<ImportedReaderSettings["default_settings"]> = {}
    const dock = asRecord(defaults.dockLayout)
    if (dock) {
      const layout: NonNullable<typeof settings.dock_layout> = {}
      for (const key of Object.keys(DOCK_FIELDS) as Array<keyof typeof DOCK_FIELDS>) {
        const parsed = DOCK_FIELDS[key].safeParse(dock[key])
        if (parsed.success) Object.assign(layout, { [key]: parsed.data })
      }
      if (Object.keys(layout).length > 0) settings.dock_layout = layout
    }
    const theme = Theme.safeParse(defaults.theme)
    if (theme.success) settings.theme = theme.data
    const iconSize = IconSize.safeParse(defaults.iconSize)
    if (iconSize.success) settings.icon_size = iconSize.data
    if (typeof defaults.reduceMotion === "boolean") settings.reduce_motion = defaults.reduceMotion
    if (Object.keys(settings).length > 0) result.default_settings = settings
  }

  if (Array.isArray(config?.lockedSettings)) {
    const locked = [...new Set(config.lockedSettings.flatMap((value) => {
      const parsed = LockedSetting.safeParse(value)
      return parsed.success ? [parsed.data] : []
    }))]
    if (locked.length > 0) result.locked_settings = locked
  }
  return result
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
