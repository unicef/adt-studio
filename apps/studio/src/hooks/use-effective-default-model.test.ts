import { describe, expect, it } from "vitest"
import { resolveEffectiveDefaultModel } from "./use-effective-default-model"

describe("resolveEffectiveDefaultModel", () => {
  it("uses the merged book default model", () => {
    expect(
      resolveEffectiveDefaultModel({
        merged: { default_model: "openai:gpt-5.6-sol" },
        hasBookOverride: true,
      }),
    ).toBe("openai:gpt-5.6-sol")
  })

  it("AC-1: falls back to Sol before config loads", () => {
    expect(resolveEffectiveDefaultModel()).toBe("openai:gpt-6.1-sol")
  })
})
