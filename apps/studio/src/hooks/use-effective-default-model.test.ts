import { describe, expect, it } from "vitest"
import { resolveEffectiveDefaultModel } from "./use-effective-default-model"
import { DEFAULT_LLM_MODEL_ID } from "@adt/types"

describe("resolveEffectiveDefaultModel", () => {
  it("uses the merged book default model", () => {
    expect(
      resolveEffectiveDefaultModel({
        merged: { default_model: "openai:gpt-5.6-sol" },
        hasBookOverride: true,
      }),
    ).toBe("openai:gpt-5.6-sol")
  })

  it("AC-1: falls back to the default model before config loads", () => {
    expect(resolveEffectiveDefaultModel()).toBe(DEFAULT_LLM_MODEL_ID)
  })
})
