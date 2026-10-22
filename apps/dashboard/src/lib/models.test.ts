import { describe, expect, it } from "vitest"
import { modelOrder, modelStats } from "./models"
import type { CallSpan, RunMetrics } from "./types"

const span = (id: number, model: string, task: string, overrides: Partial<CallSpan> = {}): CallSpan => ({
  id,
  task,
  model,
  item: `item-${id}`,
  attempt: 0,
  success: true,
  errorCount: 0,
  startS: id,
  durationS: 10,
  inputTokens: 1000,
  outputTokens: 100,
  effort: "low",
  ...overrides,
})

const run = (callSpans: CallSpan[]) => ({ callSpans }) as RunMetrics

describe("modelStats", () => {
  it("ranks models by calls and sums each one's calls", () => {
    const stats = modelStats(
      run([
        span(1, "gpt-6-luna", "metadata"),
        span(2, "gpt-6-luna", "page-sectioning", { success: false, errorCount: 2, durationS: 30 }),
        span(3, "gpt-6-luna", "page-sectioning"),
        span(4, "gpt-6.1-sol", "visual-review", { effort: "high" }),
      ]),
    )
    expect(stats.map((s) => s.model)).toEqual(["gpt-6-luna", "gpt-6.1-sol"])
    expect(stats[0]).toMatchObject({
      calls: 3,
      share: 0.75,
      failedCalls: 1,
      validationErrors: 2,
      inputTokens: 3000,
      sumS: 50,
      tasks: ["metadata", "page-sectioning"],
      efforts: ["low"],
    })
    expect(stats[1]).toMatchObject({ calls: 1, share: 0.25, efforts: ["high"] })
  })
})

describe("modelOrder", () => {
  it("orders models by their calls across every conversion", () => {
    const a = run([span(1, "mini", "x"), span(2, "sol", "x")])
    const b = run([span(3, "sol", "x"), span(4, "sol", "x"), span(5, "luna", "x")])
    expect(modelOrder([a, b])).toEqual(["sol", "luna", "mini"])
  })
})
