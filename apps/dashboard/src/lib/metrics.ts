import { errorType, isTimeout } from "./errors"
import type {
  AttemptBucket,
  CallSpan,
  ConversionData,
  ErrorBucket,
  LlmCall,
  ModelMetrics,
  RunMetrics,
  StepSpan,
  TaskMetrics,
} from "./types"
import { callCost, type PriceTier } from "./pricing"

const PDF_START_WINDOW_MS = 30 * 60 * 1000

const round1 = (n: number) => Math.round(n * 10) / 10
const sum = <T>(items: T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0)
const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))]

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k)
    if (group) group.push(item)
    else groups.set(k, [item])
  }
  return groups
}

export function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

export function peakConcurrency(calls: Pick<LlmCall, "start" | "end">[]): number {
  const events = calls
    .flatMap((c): [number, number][] => [[c.start, 1], [c.end, -1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let current = 0
  let peak = 0
  for (const [, delta] of events) {
    current += delta
    peak = Math.max(peak, current)
  }
  return peak
}

export function finalFailures(calls: LlmCall[]): number {
  const byItem = groupBy(calls, (c) => `${c.task}|${c.item || `#${c.id}`}`)
  let failures = 0
  for (const group of byItem.values()) {
    const last = group.reduce((a, b) => (b.id > a.id ? b : a))
    if (!last.success) failures++
  }
  return failures
}

function optionalSum(calls: LlmCall[], value: (c: LlmCall) => number | null): number | null {
  const known = calls.map(value).filter((v): v is number => v !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

function taskMetrics(task: string, calls: LlmCall[]): TaskMetrics {
  const durations = calls.map((c) => c.durationMs / 1000)
  const total = durations.reduce((a, b) => a + b, 0)
  return {
    task,
    models: distinct(calls.map((c) => c.model)),
    efforts: distinct(calls.map((c) => c.effort)),
    calls: calls.length,
    failedCalls: calls.filter((c) => !c.success).length,
    validationErrors: sum(calls, (c) => c.errorCount),
    inputTokens: sum(calls, (c) => c.inputTokens),
    outputTokens: sum(calls, (c) => c.outputTokens),
    sumS: round1(total),
    avgS: round1(total / calls.length),
    p50S: round1(quantile(durations, 0.5)),
    p90S: round1(quantile(durations, 0.9)),
    maxS: round1(Math.max(...durations)),
  }
}

export function computeMetrics(data: ConversionData, tier: PriceTier): RunMetrics {
  const calls = data.calls
  const knownStarts = [...data.steps.map((s) => s.startedAt), ...calls.map((c) => c.start)].filter((t): t is number => t !== null)
  const firstKnown = knownStarts.length ? Math.min(...knownStarts) : 0
  const startedFromPdf =
    data.pdfModified !== null && data.pdfModified <= firstKnown && firstKnown - data.pdfModified <= PDF_START_WINDOW_MS
  const origin = startedFromPdf && data.pdfModified !== null ? data.pdfModified : firstKnown
  const ends = [...data.steps.map((s) => s.completedAt), ...calls.map((c) => c.end)].filter((t): t is number => t !== null)
  const end = ends.length ? Math.max(...ends) : origin
  const stepStarts = data.steps.map((s) => s.startedAt).filter((t): t is number => t !== null)
  const pipelineStart = stepStarts.length ? Math.min(...stepStarts) : firstKnown

  const steps: StepSpan[] = data.steps
    .filter((s) => s.status !== "skipped")
    .flatMap((s) => {
      const start = s.startedAt ?? (s.step === "extract" && startedFromPdf ? origin : null)
      if (start === null || s.completedAt === null) return []
      return [{
        step: s.step,
        status: s.status,
        startS: round1((start - origin) / 1000),
        endS: round1((s.completedAt - origin) / 1000),
        durationS: round1((s.completedAt - start) / 1000),
        message: s.message,
      }]
    })

  const callSpans: CallSpan[] = calls.map((c) => ({
    id: c.id,
    task: c.task,
    model: c.model,
    item: c.item,
    attempt: c.attempt,
    success: c.success,
    errorCount: c.errorCount,
    startS: round1((c.start - origin) / 1000),
    durationS: round1(c.durationMs / 1000),
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    cachedInputTokens: c.cachedInputTokens,
    costUsd: callCost(c, tier),
    effort: c.effort,
  }))
  const unpriced = callSpans.filter((c) => c.costUsd === null)

  const byTask = [...groupBy(calls, (c) => c.task)].map(([task, group]) => taskMetrics(task, group))
  const byModel: ModelMetrics[] = [...groupBy(calls, (c) => c.model)].map(([model, group]) => ({
    model,
    calls: group.length,
    inputTokens: sum(group, (c) => c.inputTokens),
    outputTokens: sum(group, (c) => c.outputTokens),
    sumS: round1(sum(group, (c) => c.durationMs) / 1000),
  }))

  const errorMap = new Map<string, ErrorBucket>()
  for (const c of calls) {
    for (const message of c.validationErrors) {
      const type = errorType(message)
      const key = `${c.task}|${type}`
      const bucket = errorMap.get(key)
      if (bucket) bucket.count++
      else errorMap.set(key, { task: c.task, type, count: 1, example: message.slice(0, 300) })
    }
  }

  const attempts: AttemptBucket[] = [...groupBy(calls, (c) => `${c.task}|${c.attempt}`)].map(([, group]) => ({
    task: group[0].task,
    attempt: group[0].attempt,
    calls: group.length,
  }))

  const inputTokens = sum(calls, (c) => c.inputTokens)
  const outputTokens = sum(calls, (c) => c.outputTokens)

  return {
    name: data.name,
    startedAt: origin,
    startedFromPdf,
    totalS: round1((end - origin) / 1000),
    postExtractS: round1((end - pipelineStart) / 1000),
    callCount: calls.length,
    failedCalls: calls.filter((c) => !c.success).length,
    retries: calls.filter((c) => c.attempt > 0).length,
    validationErrors: sum(calls, (c) => c.errorCount),
    finalFailures: finalFailures(calls),
    timeouts: calls.filter((c) => c.validationErrors.some(isTimeout)).length,
    cacheHits: calls.filter((c) => c.cacheHit).length,
    peakConcurrency: peakConcurrency(calls),
    inputTokens,
    outputTokens,
    reasoningTokens: optionalSum(calls, (c) => c.reasoningTokens),
    cachedInputTokens: optionalSum(calls, (c) => c.cachedInputTokens),
    llmTimeS: round1(sum(calls, (c) => c.durationMs) / 1000),
    costUsd: sum(callSpans, (c) => c.costUsd ?? 0),
    priceTier: tier,
    unpricedModels: distinct(unpriced.map((c) => c.model)),
    unpricedCalls: unpriced.length,
    models: distinct(calls.map((c) => c.model)),
    efforts: distinct(calls.map((c) => c.effort)),
    unfinishedSteps: data.steps.filter((s) => s.status === "running" || s.status === "error").map((s) => s.step),
    steps,
    callSpans,
    byTask,
    byModel,
    errors: [...errorMap.values()],
    attempts,
  }
}

export function taskOrder(runs: RunMetrics[]): string[] {
  const first = new Map<string, number>()
  for (const run of runs) {
    for (const c of run.callSpans) first.set(c.task, Math.min(first.get(c.task) ?? Infinity, c.startS))
  }
  return [...first.keys()].sort((a, b) => (first.get(a) ?? 0) - (first.get(b) ?? 0))
}

export function stepOrder(runs: RunMetrics[]): string[] {
  const first = new Map<string, number>()
  for (const run of runs) {
    for (const s of run.steps) first.set(s.step, Math.min(first.get(s.step) ?? Infinity, s.startS))
  }
  return [...first.keys()].sort((a, b) => (first.get(a) ?? 0) - (first.get(b) ?? 0))
}

export const relativeChange = (base: number, value: number) => (base === 0 ? null : (value - base) / base)
