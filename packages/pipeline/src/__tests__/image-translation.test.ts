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
  it.each(["openai:dall-e-3", "google:gemini-3.1-flash-image"])("inherits the image-generation default %s", (model) => {
    expect(
      buildImageTranslationConfig(
        makeConfig({ default_image_generation_model: model }),
      ).modelId,
    ).toBe(model)
  })

  it.each(["openai:gpt-image-2", "google:gemini-3.1-flash-image"])("prioritizes the translation override %s", (model) => {
    expect(
      buildImageTranslationConfig(
        makeConfig({
          default_image_generation_model: "openai:dall-e-3",
          image_translation: { image_model: model },
        }),
      ).modelId,
    ).toBe(model)
  })
})
