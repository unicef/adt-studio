import { describe, expect, it } from "vitest"
import { findReasoningEffortSupport, fitReasoningEffort, type ReasoningEffortSupport } from "../reasoning-effort.js"

const supports: ReasoningEffortSupport[] = [
  { models: "gpt-6\\.1-sol", efforts: ["low", "medium", "high", "xhigh", "max"], default: "low" },
  { models: "gpt-5.*", efforts: ["low", "medium", "high"], default: "medium" },
]

describe("findReasoningEffortSupport", () => {
  it("matches the bare model id, with or without a provider prefix", () => {
    expect(findReasoningEffortSupport(supports, "openai:gpt-6.1-sol")?.default).toBe("low")
    expect(findReasoningEffortSupport(supports, "gpt-5.4-mini")?.default).toBe("medium")
  })

  it("returns null for models without reasoning effort support", () => {
    expect(findReasoningEffortSupport(supports, "openai:gpt-4.1")).toBeNull()
    expect(findReasoningEffortSupport(supports, "openai:gpt-6.1-sol-preview")).toBeNull()
    expect(findReasoningEffortSupport(undefined, "openai:gpt-6.1-sol")).toBeNull()
  })
})

describe("fitReasoningEffort", () => {
  const sol = supports[0]
  const gpt5 = supports[1]

  it("keeps a supported effort", () => {
    expect(fitReasoningEffort(sol, "xhigh")).toBe("xhigh")
  })

  it("moves an unsupported effort to the closest supported level", () => {
    expect(fitReasoningEffort(sol, "none")).toBe("low")
    expect(fitReasoningEffort(sol, "minimal")).toBe("low")
    expect(fitReasoningEffort(gpt5, "xhigh")).toBe("high")
    expect(fitReasoningEffort(gpt5, "max")).toBe("high")
  })

  it("drops the effort when the model has no support or nothing was requested", () => {
    expect(fitReasoningEffort(null, "high")).toBeUndefined()
    expect(fitReasoningEffort(sol, undefined)).toBeUndefined()
  })
})
