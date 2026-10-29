import { describe, expect, it } from "vitest"
import { errorType } from "./errors"
import { parseCall } from "./parse-call"
import { computeMetrics, finalFailures, peakConcurrency, quantile } from "./metrics"
import type { ConversionData, LlmCall } from "./types"

const T0 = Date.parse("2026-10-16T19:51:15.000Z")

function call(overrides: Partial<LlmCall> & Pick<LlmCall, "id" | "start" | "end">): LlmCall {
  return {
    task: "web-rendering",
    model: "gpt-6-luna",
    item: "pg001",
    attempt: 0,
    success: true,
    errorCount: 0,
    cacheHit: false,
    durationMs: overrides.end - overrides.start,
    inputTokens: 100,
    outputTokens: 10,
    reasoningTokens: null,
    cachedInputTokens: null,
    effort: null,
    validationErrors: [],
    ...overrides,
  }
}

describe("parseCall", () => {
  it("reads the fields the llm_log stores and derives the start from durationMs", () => {
    const raw = JSON.stringify({
      params: { requestedModel: "openai:gpt-6.1-sol", providerOptions: { openai: { reasoningEffort: "medium" } }, reasoningTokens: 42, remoteCachedInputTokens: 7 },
      timestamp: "2026-10-16T19:55:34.123Z",
      taskType: "visual-review",
      pageId: "pg009",
      modelId: "openai:gpt-6.1-sol",
      cacheHit: false,
      success: false,
      errorCount: 1,
      attempt: 1,
      durationMs: 1123,
      usage: { inputTokens: 900, outputTokens: 80 },
      validationErrors: ["The operation was aborted due to timeout"],
    })
    const parsed = parseCall(5, raw, "fallback")
    expect(parsed).toMatchObject({
      id: 5,
      task: "visual-review",
      model: "gpt-6.1-sol",
      item: "pg009",
      attempt: 1,
      success: false,
      errorCount: 1,
      effort: "medium",
      reasoningTokens: 42,
      cachedInputTokens: 7,
      inputTokens: 900,
      outputTokens: 80,
      end: Date.parse("2026-10-16T19:55:34.123Z"),
      start: Date.parse("2026-10-16T19:55:34.123Z") - 1123,
    })
  })

  it("prefers the applied effort when the client adjusted it", () => {
    const raw = JSON.stringify({ timestamp: "2026-10-16T19:55:34.123Z", params: { providerOptions: { openai: { reasoningEffort: "low" } }, reasoningEffortAdjustment: { requested: "max", applied: "high" } } })
    expect(parseCall(1, raw, "x")?.effort).toBe("high")
  })

  it("returns null for rows without a timestamp", () => {
    expect(parseCall(1, "{}", "x")).toBeNull()
    expect(parseCall(1, "not json", "x")).toBeNull()
  })
})

describe("metric helpers", () => {
  it("counts the peak of overlapping calls", () => {
    expect(peakConcurrency([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 10, end: 20 }])).toBe(2)
  })

  it("counts only items whose last attempt failed", () => {
    const calls = [
      call({ id: 1, start: 0, end: 1, item: "pg001", success: false }),
      call({ id: 2, start: 1, end: 2, item: "pg001", success: true, attempt: 1 }),
      call({ id: 3, start: 0, end: 1, item: "pg002", success: false }),
    ]
    expect(finalFailures(calls)).toBe(1)
  })

  it("takes the lower-index quantile", () => {
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3)
    expect(quantile([], 0.9)).toBe(0)
  })

  it("groups known validation messages and keeps unknown ones apart", () => {
    expect(errorType("The source contains at least 3 learner response prompt(s), but the rendering has only 1")).toBe("Missing response controls")
    expect(errorType("Something \"odd\" happened 12 times")).toBe("Something \"…\" happened N times")
  })
})

describe("computeMetrics", () => {
  const data: ConversionData = {
    name: "book",
    pdfModified: T0,
    pdfHash: "abc",
    config: null,
    steps: [
      { step: "extract", status: "done", startedAt: null, completedAt: T0 + 30_000, message: "" },
      { step: "metadata", status: "done", startedAt: T0 + 30_000, completedAt: T0 + 35_000, message: "" },
      { step: "translation", status: "skipped", startedAt: null, completedAt: T0 + 40_000, message: "" },
      { step: "web-rendering", status: "done", startedAt: T0 + 40_000, completedAt: T0 + 100_000, message: "" },
    ],
    calls: [
      call({ id: 1, task: "metadata", start: T0 + 30_000, end: T0 + 35_000, item: "" }),
      call({ id: 2, start: T0 + 40_000, end: T0 + 60_000, success: false, errorCount: 2, validationErrors: ["Text node outside any data-id element: \"x\"", "aborted due to timeout"] }),
      call({ id: 3, start: T0 + 60_000, end: T0 + 90_000, attempt: 1, effort: "medium", reasoningTokens: 5 }),
    ],
  }

  it("measures the conversion from the PDF upload to the last step", () => {
    const m = computeMetrics(data, "short")
    expect(m.startedFromPdf).toBe(true)
    expect(m.totalS).toBe(100)
    expect(m.postExtractS).toBe(70)
    expect(m.steps.map((s) => s.step)).toEqual(["extract", "metadata", "web-rendering"])
    expect(m.steps[0]).toMatchObject({ startS: 0, endS: 30, durationS: 30 })
  })

  it("totals calls, failures, tokens and errors", () => {
    const m = computeMetrics(data, "short")
    expect(m).toMatchObject({
      callCount: 3,
      failedCalls: 1,
      retries: 1,
      validationErrors: 2,
      finalFailures: 0,
      timeouts: 1,
      inputTokens: 300,
      outputTokens: 30,
      reasoningTokens: 5,
      cachedInputTokens: null,
      efforts: ["medium"],
    })
    const web = m.byTask.find((t) => t.task === "web-rendering")
    expect(web).toMatchObject({ calls: 2, failedCalls: 1, p50S: 30, maxS: 30, sumS: 50 })
    expect(m.errors.map((e) => e.type).sort()).toEqual(["Text outside data-id", "Timeout"])
  })

  it("falls back to the first step when the PDF is older than the run", () => {
    const m = computeMetrics({ ...data, pdfModified: T0 - 24 * 3600 * 1000 }, "short")
    expect(m.startedFromPdf).toBe(false)
    expect(m.totalS).toBe(70)
  })

  it("prices each call at its model's rate in the chosen tier", () => {
    expect(computeMetrics(data, "short")).toMatchObject({ priceTier: "short", unpricedCalls: 0, unpricedModels: [] })
    expect(computeMetrics(data, "short").costUsd).toBeCloseTo((3 * (100 * 0.1 + 10 * 0.5)) / 1_000_000)
    expect(computeMetrics(data, "long").costUsd).toBeCloseTo((3 * (100 * 0.2 + 10 * 0.75)) / 1_000_000)
  })

  it("leaves calls of models without a price out of the cost and lists them", () => {
    const m = computeMetrics({ ...data, calls: [...data.calls, call({ id: 4, start: T0 + 90_000, end: T0 + 95_000, model: "unknown-model" })] }, "short")
    expect(m).toMatchObject({ unpricedCalls: 1, unpricedModels: ["unknown-model"] })
    expect(m.costUsd).toBeCloseTo((3 * (100 * 0.1 + 10 * 0.5)) / 1_000_000)
    expect(m.callSpans.find((c) => c.id === 4)?.costUsd).toBeNull()
  })
})
