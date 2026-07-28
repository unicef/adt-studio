import { describe, expect, it } from "vitest"
import {
  promptModelForSelectedModel,
  promptNameForSelectedModel,
} from "./promptModel"

describe("prompt model resolution", () => {
  it("uses GPT-5.4 as the base model by default", () => {
    expect(promptModelForSelectedModel("openai:gpt-5.4")).toBeNull()
    expect(promptNameForSelectedModel("section", "openai:gpt-5.4")).toBe(
      "section",
    )
  })

  it("keeps GPT-5.6-sol model-specific when it is the runtime default", () => {
    expect(promptModelForSelectedModel("openai:gpt-5.6-sol")).toBe(
      "openai:gpt-5.6-sol",
    )
    expect(
      promptNameForSelectedModel("section", "openai:gpt-5.6-sol"),
    ).toBe("section__openai_gpt_5_6_sol")
  })
})
