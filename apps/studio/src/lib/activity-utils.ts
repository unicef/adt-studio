/** Check if a section type is an activity (prefixed with `activity_`) */
export function isActivitySection(sectionType: string): boolean {
  return sectionType.startsWith("activity_")
}

/**
 * Format a raw section type into a human-readable label.
 * `activity_multiple_choice` → `Multiple Choice`
 * `body_text` → `Body Text`
 */
export function formatSectionType(sectionType: string): string {
  const base = sectionType.startsWith("activity_")
    ? sectionType.slice("activity_".length)
    : sectionType
  return base
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/** Format an answer value for display */
export function formatAnswerValue(value: string | boolean | number): string {
  if (typeof value === "boolean") return value ? "True" : "False"
  return String(value)
}
