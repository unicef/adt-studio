const SECTIONING_CHANGE_FIELDS = new Set([
  "section_types",
  "pruned_section_types",
  "disabled_section_types",
  "page_sectioning",
])

export function hasSectioningData(stepStatus: string): boolean {
  return stepStatus === "done" || stepStatus === "skipped"
}

export function hasSectioningChanges(
  dirty: Record<string, boolean>,
  sectioningPromptDraft: string | null
): boolean {
  if (sectioningPromptDraft != null) return true
  return Object.keys(dirty).some((field) => SECTIONING_CHANGE_FIELDS.has(field))
}
