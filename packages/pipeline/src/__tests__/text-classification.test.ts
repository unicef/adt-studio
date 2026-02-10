import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import { buildClassifyConfig } from "../text-classification.js"

describe("buildClassifyConfig", () => {
  it("extracts text classification model and prompt config", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      text_classification: {
        prompt: "custom_prompt",
        model: "openai:gpt-4.1-mini",
      },
    }

    const config = buildClassifyConfig(appConfig)
    expect(config.promptName).toBe("custom_prompt")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
  })

  it("defaults text classification model and prompt", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const config = buildClassifyConfig(appConfig)
    expect(config.promptName).toBe("text_classification")
    expect(config.modelId).toBe("openai:gpt-4o")
  })
})
