import type { ConversionSummary } from "./types"

export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"]
export const MAX_RUNS = SERIES_COLORS.length
export const CRITICAL = "var(--critical)"

export interface RunView extends ConversionSummary {
  color: string
}
