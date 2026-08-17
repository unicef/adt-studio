import type { I18n } from "@lingui/core"
import { getSettingsTabs } from "@/components/pipeline/settings-tabs"

export const STEP_SETTINGS_SLUGS = [
  "extract",
  "sectioning",
  "storyboard",
  "captions",
  "quizzes",
  "glossary",
  "toc",
  "easy-read",
  "translate",
  "speech",
  "validation",
] as const

export type StepSettingsSlug = (typeof STEP_SETTINGS_SLUGS)[number]

const STEP_SETTINGS_SLUG_SET: Set<string> = new Set<string>(STEP_SETTINGS_SLUGS)

export function isStepSettingsSlug(slug: string): slug is StepSettingsSlug {
  return STEP_SETTINGS_SLUG_SET.has(slug)
}

export interface StepSettingsTab {
  key: string
  label: string
}

export function stepSettingsTabs(slug: StepSettingsSlug, i18n: I18n): StepSettingsTab[] {
  return getSettingsTabs(slug, i18n, false) ?? []
}

export function defaultStepSettingsTab(slug: StepSettingsSlug, i18n: I18n): string {
  return stepSettingsTabs(slug, i18n)[0]?.key ?? "general"
}
