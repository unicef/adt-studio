import type { LlmCall } from "./types"

type Row = Record<string, unknown>

const asObject = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {}
const asNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
export const asString = (value: unknown): string | null => (typeof value === "string" ? value : null)
export const asTime = (value: unknown): number | null => {
  const text = asString(value)
  if (!text) return null
  const time = Date.parse(text)
  return Number.isFinite(time) ? time : null
}

function effortOf(params: Row): string | null {
  const adjustment = asObject(params.reasoningEffortAdjustment)
  if ("applied" in adjustment) return asString(adjustment.applied) ?? "none"
  for (const provider of Object.values(asObject(params.providerOptions))) {
    const options = asObject(provider)
    const effort = asString(options.reasoningEffort) ?? asString(options.reasoning_effort)
    if (effort) return effort
  }
  return asString(params.reasoningEffort)
}

export function parseCall(id: number, raw: string, fallbackTask: string): LlmCall | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const data = asObject(parsed)
  const params = asObject(data.params)
  const usage = asObject(data.usage)
  const end = asTime(data.timestamp)
  if (end === null) return null
  const durationMs = asNumber(data.durationMs) ?? 0
  const model = asString(data.modelId) ?? asString(params.requestedModel) ?? "unknown"
  const errors = Array.isArray(data.validationErrors) ? data.validationErrors.filter((e): e is string => typeof e === "string") : []
  return {
    id,
    task: asString(data.taskType) ?? fallbackTask,
    model: model.replace(/^[^:]+:/, ""),
    item: asString(data.pageId) ?? asString(data.itemId) ?? "",
    attempt: asNumber(data.attempt) ?? 0,
    success: data.success !== false,
    errorCount: asNumber(data.errorCount) ?? errors.length,
    cacheHit: data.cacheHit === true,
    durationMs,
    inputTokens: asNumber(usage.inputTokens) ?? 0,
    outputTokens: asNumber(usage.outputTokens) ?? 0,
    reasoningTokens: asNumber(params.reasoningTokens),
    cachedInputTokens: asNumber(params.remoteCachedInputTokens),
    effort: effortOf(params),
    start: end - durationMs,
    end,
    validationErrors: errors,
  }
}
