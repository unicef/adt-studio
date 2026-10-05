import type { AdtPageEntry, PageSummarySection } from "@/api/client"

function pad3(value: number): string {
  return String(value).padStart(3, "0")
}

export function previewSectionId(
  sections: PageSummarySection[] | undefined,
  quizIndex: number | null,
): string | null {
  if (quizIndex != null) return `qz${pad3(quizIndex + 1)}`
  return sections?.find((section) => !section.isPruned)?.sectionId ?? null
}

export function previewHrefForSection(
  sectionId: string | null,
  manifest: AdtPageEntry[] | undefined,
): string | undefined {
  if (!sectionId) return undefined
  return manifest?.find((entry) => entry.section_id === sectionId)?.href
}
