import type { ExtractionWarning } from "@adt/types"

/**
 * Minimum amount of vision-recovered text (non-whitespace characters) before we
 * treat an empty-text-layer page as one that "should have had text". Keeps blank
 * or illustration-only pages — where the Sectioning step also finds little or
 * nothing — from being flagged.
 */
export const MIN_RECOVERED_TEXT_CHARS = 24

type SectioningNode = { isPruned?: boolean; text?: string; children?: unknown[] }
type SectioningSection = { isPruned?: boolean; nodes?: unknown[] }

/**
 * Collect the visible text from a page-sectioning tree, skipping pruned sections
 * and pruned leaves. Mirrors the page-level preview walk in the pages route.
 */
export function flattenVisibleSectioningText(
  sections: SectioningSection[] | undefined | null
): string {
  if (!sections) return ""
  const parts: string[] = []
  const walk = (node: SectioningNode): void => {
    if (node.isPruned) return
    if (typeof node.text === "string" && node.text.length > 0) parts.push(node.text)
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child as SectioningNode)
    }
  }
  for (const section of sections) {
    if (section.isPruned) continue
    for (const node of section.nodes ?? []) walk(node as SectioningNode)
  }
  return parts.join("\n")
}

/**
 * Cross-check the embedded text layer against the Sectioning step's
 * vision-recovered text. When the extracted text is empty but the Sectioning
 * step recovered a meaningful amount of text from the page image, the PDF's text
 * isn't being extracted directly (a scanned/image-only page) — flag it.
 *
 * Returns null when there's nothing to flag, or when Sectioning hasn't run yet
 * (no recovered text to compare against).
 */
export function classifyExtractionWarning(
  extractText: string,
  sectioningText: string | null | undefined
): ExtractionWarning | null {
  const extractEmpty = extractText.trim().length === 0
  if (!extractEmpty) return null
  const recoveredChars = (sectioningText ?? "").replace(/\s+/g, "").length
  return recoveredChars >= MIN_RECOVERED_TEXT_CHARS ? "text-layer-missing" : null
}
