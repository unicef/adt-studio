import { estimateCost, groupBy, quantile } from "./metrics"
import type { RunMetrics } from "./types"

export interface ModelStats {
  model: string
  calls: number
  share: number
  failedCalls: number
  validationErrors: number
  inputTokens: number
  outputTokens: number
  sumS: number
  avgS: number
  p50S: number
  p90S: number
  costUsd: number
  tasks: string[]
  efforts: string[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function modelStats(run: RunMetrics): ModelStats[] {
  const total = run.callSpans.length
  return [...groupBy(run.callSpans, (c) => c.model)]
    .map(([model, calls]) => {
      const durations = calls.map((c) => c.durationS)
      const sumS = durations.reduce((a, b) => a + b, 0)
      const inputTokens = calls.reduce((s, c) => s + c.inputTokens, 0)
      const outputTokens = calls.reduce((s, c) => s + c.outputTokens, 0)
      return {
        model,
        calls: calls.length,
        share: total ? calls.length / total : 0,
        failedCalls: calls.filter((c) => !c.success).length,
        validationErrors: calls.reduce((s, c) => s + c.errorCount, 0),
        inputTokens,
        outputTokens,
        sumS: round1(sumS),
        avgS: round1(sumS / calls.length),
        p50S: round1(quantile(durations, 0.5)),
        p90S: round1(quantile(durations, 0.9)),
        costUsd: estimateCost(inputTokens, outputTokens),
        tasks: [...new Set(calls.map((c) => c.task))],
        efforts: [...new Set(calls.map((c) => c.effort).filter((e): e is string => e !== null))],
      }
    })
    .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model))
}

export function modelOrder(runs: RunMetrics[]): string[] {
  const calls = new Map<string, number>()
  for (const run of runs) for (const c of run.callSpans) calls.set(c.model, (calls.get(c.model) ?? 0) + 1)
  return [...calls].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([model]) => model)
}
