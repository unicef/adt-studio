import { fmtDuration, fmtInt, fmtTokens, fmtUsd } from "./format"
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
    note: "Each call at its model's price per token: input, cached input and output, in the context tier picked in the top bar",
    value: (m) => m.costUsd,
    format: fmtUsd,
  },
]
