import { describe, expect, it } from "vitest"
import { callCost, priceOf } from "./pricing"

const tokens = (model: string, inputTokens: number, cachedInputTokens: number | null, outputTokens: number) => ({ model, inputTokens, cachedInputTokens, outputTokens })

describe("callCost", () => {
  it("prices cached input apart from the rest of the input", () => {
    const call = tokens("gpt-6.1-sol", 1_000_000, 400_000, 100_000)
    expect(callCost(call, "short")).toBeCloseTo(2.24)
    expect(callCost(call, "long")).toBeCloseTo(3.98)
  })

  it("charges the whole input at full price when the log has no cached tokens", () => {
    expect(callCost(tokens("gpt-5.4", 1_000_000, null, 1_000_000), "short")).toBeCloseTo(17.5)
    expect(callCost(tokens("gpt-5.4", 1_000_000, null, 1_000_000), "long")).toBeCloseTo(27.5)
  })

  it("charges cached tokens at full price for models without a cached-input price", () => {
    expect(callCost(tokens("gpt-5.4-pro", 1_000_000, 500_000, 0), "short")).toBeCloseTo(30)
  })

  it("returns null for a model or tier without a price", () => {
    expect(callCost(tokens("unknown-model", 10, null, 10), "short")).toBeNull()
    expect(priceOf("gpt-6-sol", "short")).toBeNull()
    expect(priceOf("gpt-6-sol", "long")).toEqual({ input: 4, output: 15, cachedInput: 0.4 })
  })
})
