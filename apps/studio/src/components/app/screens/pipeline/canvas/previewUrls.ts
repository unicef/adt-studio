import { BASE_URL } from "@/api/client"

/**
 * The `adt-preview` routes serve the same interactive HTML the runtime and the
 * packaged book use — the ADT bundle included. Activities and quizzes load it
 * live instead of a screenshot so they stay playable in the storyboard.
 */
function previewUrl(label: string, file: string, version: number | null | undefined): string {
  return `${BASE_URL}/books/${label}/adt-preview/${file}.html?embed=1&fit=1&v=${version ?? 0}`
}

export function sectionPreviewUrl(
  label: string,
  pageId: string,
  sectionIndex: number,
  renderingVersion: number | null,
): string {
  return previewUrl(label, `${pageId}_sec${String(sectionIndex + 1).padStart(3, "0")}`, renderingVersion)
}

export function quizPreviewUrl(label: string, quizIndex: number, version: number | null): string {
  return previewUrl(label, `qz${String(quizIndex + 1).padStart(3, "0")}`, version)
}
