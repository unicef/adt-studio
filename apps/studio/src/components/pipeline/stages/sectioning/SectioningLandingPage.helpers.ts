export function resolveSectioningStartStage(
  extractCovered: boolean,
  hasExtractedPages: boolean,
): "extract" | "sectioning" {
  return extractCovered || hasExtractedPages ? "sectioning" : "extract"
}
