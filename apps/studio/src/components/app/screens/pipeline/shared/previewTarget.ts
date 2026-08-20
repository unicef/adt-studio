import type { AdtPageEntry, PageSummarySection } from "@/api/client"

function pad3(value: number): string {
  return String(value).padStart(3, "0")
}

/**
 * The packaged-book section the canvas is currently showing. A quiz is packaged
 * as its own page (`qz001`), a storyboard page as its first section that
 * survived pruning — pruned sections never reach the bundle.
 */
export function previewSectionId(
  sections: PageSummarySection[] | undefined,
  quizIndex: number | null,
): string | null {
  if (quizIndex != null) return `qz${pad3(quizIndex + 1)}`
  return sections?.find((section) => !section.isPruned)?.sectionId ?? null
}

/**
 * Resolves a section id to its file in the packaged bundle. Returns undefined
 * when the manifest lacks the section, which leaves the preview on the book's
 * own first page instead of pointing the iframe at a 404.
 */
export function previewHrefForSection(
  sectionId: string | null,
  manifest: AdtPageEntry[] | undefined,
): string | undefined {
  if (!sectionId) return undefined
  return manifest?.find((entry) => entry.section_id === sectionId)?.href
}
