import type { AppConfig, FigureExtractionMode } from "@adt/types"

/** Resolve the new mode while preserving the behavior of existing books. */
export function resolveFigureExtractionMode(
  config: Pick<AppConfig, "figure_extraction_mode" | "vector_text_grouping">,
): FigureExtractionMode {
  if (config.figure_extraction_mode) return config.figure_extraction_mode
  return config.vector_text_grouping === false ? "off" : "all"
}

/** The extraction flags derived from the resolved figure-extraction mode. */
export function figureExtractionFlags(
  config: Pick<AppConfig, "figure_extraction_mode" | "vector_text_grouping">,
): { vectorTextGrouping: boolean; keepCoveredRasters: boolean } {
  const mode = resolveFigureExtractionMode(config)
  return { vectorTextGrouping: mode !== "off", keepCoveredRasters: mode === "auto" }
}
