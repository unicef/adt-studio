import { FigureExtractionMode } from "@adt/types"

export function readFigureExtractionMode(
  config: Record<string, unknown>,
): FigureExtractionMode {
  const explicit = FigureExtractionMode.safeParse(config.figure_extraction_mode)
  if (explicit.success) return explicit.data
  return config.vector_text_grouping === false ? "off" : "all"
}
