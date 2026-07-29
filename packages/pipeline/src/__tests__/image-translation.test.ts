import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import { buildImageTranslationConfig } from "../image-translation.js"

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    structure_types: {},
    role_types: {},
    ...overrides,
  }
}

describe("buildImageTranslationConfig", () => {
  it("uses the platform or book image-generation default", () => {
    expect(
      buildImageTranslationConfig(
        makeConfig({ default_image_generation_model: "openai:dall-e-3" }),
      ).modelId,
    ).toBe("openai:dall-e-3")
  })

  it("keeps the step-specific image model at highest priority", () => {
    expect(
      buildImageTranslationConfig(
        makeConfig({
          default_image_generation_model: "openai:dall-e-3",
          image_translation: { image_model: "openai:gpt-image-2" },
        }),
      ).modelId,
    ).toBe("openai:gpt-image-2")
  })
})
