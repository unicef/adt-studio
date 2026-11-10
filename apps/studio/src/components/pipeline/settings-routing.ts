export const SETTINGS_STAGE_SLUGS = [
  "book",
  "extract",
  "sectioning",
  "storyboard",
  "quizzes",
  "glossary",
  "toc",
  "easy-read",
  "captions",
  "translate",
  "speech",
  "sign-language",
  "validation",
  "preview",
  "export",
] as const

export type SettingsStageSlug = (typeof SETTINGS_STAGE_SLUGS)[number]

/** Stages whose settings Overview tab is their landing page, with its Run button. */
export const OVERVIEW_STAGE_SLUGS = [
  "extract",
  "sectioning",
  "storyboard",
  "quizzes",
  "glossary",
  "toc",
  "easy-read",
  "captions",
  "translate",
  "speech",
] as const satisfies readonly SettingsStageSlug[]

export function resolveSettingsStageSlug(step: string): SettingsStageSlug | null {
  return SETTINGS_STAGE_SLUGS.includes(step as SettingsStageSlug)
    ? (step as SettingsStageSlug)
    : null
}
