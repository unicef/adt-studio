import { describe, expect, it } from "vitest"
import type { AppConfig, TextCatalogOutput } from "@adt/types"
import type { GenerateObjectOptions, GenerateObjectResult, LLMModel } from "@adt/llm"
import {
  buildCatalogTranslationConfig,
  getTargetLanguages,
  translateCatalogBatch,
} from "../catalog-translation.js"

function makeFakeLLMModel(
  translationsFn: (texts: Array<{ index: number; text: string }>) => string[],
  onCall?: (options: GenerateObjectOptions) => void
): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      onCall?.(options)
      const context = options.context as { texts: Array<{ index: number; text: string }> }
      return {
        object: { translations: translationsFn(context.texts) } as T,
        usage: { inputTokens: 10, outputTokens: 10 },
      } as GenerateObjectResult<T>
    },
  }
}

describe("buildCatalogTranslationConfig", () => {
  it("uses defaults when no translation config", () => {
    const appConfig: AppConfig = {
      text_types: { body: "Body" },
      text_group_types: { paragraph: "Para" },
    }
    const config = buildCatalogTranslationConfig(appConfig, "en")
    expect(config.sourceLanguage).toBe("en")
    expect(config.promptName).toBe("translation")
    expect(config.modelId).toBe("openai:gpt-4.1")
    expect(config.batchSize).toBe(50)
  })

  it("uses appConfig overrides", () => {
    const appConfig: AppConfig = {
      text_types: { body: "Body" },
      text_group_types: { paragraph: "Para" },
      translation: { model: "openai:gpt-5", prompt: "custom_translation" },
    }
    const config = buildCatalogTranslationConfig(appConfig, "fr")
    expect(config.sourceLanguage).toBe("fr")
    expect(config.promptName).toBe("custom_translation")
    expect(config.modelId).toBe("openai:gpt-5")
  })
})

describe("getTargetLanguages", () => {
  it("returns empty for no output_languages", () => {
    expect(getTargetLanguages(undefined, "en")).toEqual([])
    expect(getTargetLanguages([], "en")).toEqual([])
  })

  it("filters out the source language", () => {
    expect(getTargetLanguages(["en", "fr", "es"], "en")).toEqual(["fr", "es"])
  })

  it("handles locale codes", () => {
    expect(getTargetLanguages(["en_US", "fr", "es"], "en")).toEqual(["fr", "es"])
  })

  it("returns all when none match source", () => {
    expect(getTargetLanguages(["fr", "es", "de"], "en")).toEqual(["fr", "es", "de"])
  })
})

describe("translateCatalogBatch", () => {
  const config = buildCatalogTranslationConfig(
    { text_types: { body: "Body" }, text_group_types: { p: "P" } },
    "en"
  )

  it("translates entries preserving IDs", async () => {
    const entries = [
      { id: "pg001_gp001_tx001", text: "Hello" },
      { id: "pg001_im001", text: "A sunset" },
      { id: "gl001", text: "Photosynthesis" },
    ]

    const model = makeFakeLLMModel((texts) =>
      texts.map((t) => `[fr] ${t.text}`)
    )

    const result = await translateCatalogBatch(entries, "fr", config, model)

    expect(result).toEqual([
      { id: "pg001_gp001_tx001", text: "[fr] Hello" },
      { id: "pg001_im001", text: "[fr] A sunset" },
      { id: "gl001", text: "[fr] Photosynthesis" },
    ])
  })

  it("returns empty array for empty input", async () => {
    const model = makeFakeLLMModel(() => [])
    const result = await translateCatalogBatch([], "fr", config, model)
    expect(result).toEqual([])
  })

  it("passes correct context to LLM", async () => {
    const entries = [{ id: "tx001", text: "Hello" }]
    let capturedContext: Record<string, unknown> | undefined

    const model = makeFakeLLMModel(
      (texts) => texts.map(() => "Bonjour"),
      (options) => {
        capturedContext = options.context
      }
    )

    await translateCatalogBatch(entries, "fr", config, model)

    expect(capturedContext).toEqual({
      source_language_code: "en",
      source_language: "English",
      target_language_code: "fr",
      target_language: "French",
      texts: [{ index: 0, text: "Hello" }],
    })
  })

  it("validates translation count matches input", async () => {
    const entries = [
      { id: "tx001", text: "Hello" },
      { id: "tx002", text: "World" },
    ]

    // Model that returns wrong count — validation should reject and retry
    let callCount = 0
    const model: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        callCount++
        const translations = callCount === 1
          ? ["Only one"]  // Wrong count on first call
          : ["Bonjour", "Monde"]  // Correct on retry

        // Simulate validation
        const validator = options.validate!
        const result = { translations }
        const validation = validator(result, options.context ?? {})
        if (!validation.valid) {
          // On validation failure, the real LLM retries; simulate retry
          return {
            object: { translations: ["Bonjour", "Monde"] } as T,
            usage: { inputTokens: 10, outputTokens: 10 },
          } as GenerateObjectResult<T>
        }

        return {
          object: result as T,
          usage: { inputTokens: 10, outputTokens: 10 },
        } as GenerateObjectResult<T>
      },
    }

    const result = await translateCatalogBatch(entries, "fr", config, model)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("tx001")
    expect(result[1].id).toBe("tx002")
  })
})
