export function resolveSectioningStartStage(
  extractCovered: boolean,
  hasAssembledPages: boolean,
): "extract" | "sectioning" {
  return extractCovered || hasAssembledPages ? "sectioning" : "extract"
}
