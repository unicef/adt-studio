export type BookSettingsScope = "book" | "storyboard"

export const BOOK_SECTION_KEYS = ["information", "api-keys", "models"] as const

export const STORYBOARD_SECTION_KEYS = [
  "general",
  "fonts",
  "rendering-prompt",
  "rendering-template",
  "activity-prompts",
  "image-generation",
  "visual-review-prompt",
] as const

export const DEFAULT_BOOK_SETTINGS_SECTION = "information"

export const DEFAULT_STORYBOARD_SETTINGS_SECTION = "general"

const SCOPE_BY_SECTION = new Map<string, BookSettingsScope>([
  ...BOOK_SECTION_KEYS.map((key) => [key, "book"] as const),
  ...STORYBOARD_SECTION_KEYS.map((key) => [key, "storyboard"] as const),
])

export function isBookSettingsSection(section: string): boolean {
  return SCOPE_BY_SECTION.has(section)
}

export function bookSettingsScope(section: string): BookSettingsScope {
  return SCOPE_BY_SECTION.get(section) ?? "book"
}

export function storyboardTabSection(tab: string): string {
  return bookSettingsScope(tab) === "storyboard" ? tab : DEFAULT_STORYBOARD_SETTINGS_SECTION
}
