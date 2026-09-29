import { expect, it } from "vitest"
import { isDefaultPromptModelId, promptExistsForModel, removeDefaultPromptModelGroups } from "./promptSettings"

it("classifies generic and variant prompts against the configured base model", () => {
  const base = "custom:base"
  const prompt = { name: "test", variants: [] }
  expect(isDefaultPromptModelId(base, base)).toBe(true)
  expect(isDefaultPromptModelId("openai:gpt-5.4", base)).toBe(false)
  expect(promptExistsForModel(prompt, base, base)).toBe(true)
  expect(promptExistsForModel(prompt, "openai:gpt-5.4", base)).toBe(false)
  expect(removeDefaultPromptModelGroups([
    { provider: "custom", models: ["base", "other"] },
    { provider: "openai", models: ["gpt-5.4"] },
  ], base)).toEqual([
    { provider: "custom", models: ["other"] },
    { provider: "openai", models: ["gpt-5.4"] },
  ])
})
