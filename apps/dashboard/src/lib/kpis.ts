import { fmtDuration, fmtInt, fmtTokens, fmtUsd } from "./format"
import { APP_PRICE } from "./metrics"
import type { RunMetrics } from "./types"

export interface Kpi {
  id: string
  label: string
  note: string
  value: (m: RunMetrics) => number
  format: (n: number) => string
}

export const KPIS: Kpi[] = [
  { id: "time", label: "Total time", note: "From the conversion start to the end of the last step", value: (m) => m.totalS, format: fmtDuration },
  { id: "calls", label: "LLM calls", note: "Retries included", value: (m) => m.callCount, format: fmtInt },
  { id: "failed", label: "Failed calls", note: "Rejected by validation or timed out, then retried", value: (m) => m.failedCalls, format: fmtInt },
  { id: "errors", label: "Validation errors", note: "Messages in validationErrors; one failure can have several", value: (m) => m.validationErrors, format: fmtInt },
  { id: "tokens", label: "Tokens", note: "Input + output", value: (m) => m.inputTokens + m.outputTokens, format: fmtTokens },
  {
    id: "cost",
    label: "Estimated cost",
    note: `Studio Stats tab formula: ${fmtUsd(APP_PRICE.inputPerMillion)}/M input, ${fmtUsd(APP_PRICE.outputPerMillion)}/M output, the same for every model`,
    value: (m) => m.costUsd,
    format: fmtUsd,
  },
]
