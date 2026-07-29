export const SETTINGS_SECTIONS = ["default-model", "api-keys", "prompts"] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function normalizeSettingsSection(value: unknown): SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection)
    ? value as SettingsSection
    : "default-model"
}
