export const FOUNDATION_SLUGS = ["extract", "sectioning"] as const

export const PLUGIN_SLUGS = [
  "captions",
  "quizzes",
  "glossary",
  "toc",
  "easy-read",
  "translate",
  "speech",
  "sign-language",
  "validation",
] as const

export type FoundationSlug = (typeof FOUNDATION_SLUGS)[number]
export type PluginSlug = (typeof PLUGIN_SLUGS)[number]
export type DockSlug = FoundationSlug | PluginSlug

const DOCK_SLUG_SET: Set<string> = new Set<string>([
  ...FOUNDATION_SLUGS,
  ...PLUGIN_SLUGS,
])

export function isDockSlug(slug: string): slug is DockSlug {
  return DOCK_SLUG_SET.has(slug)
}
