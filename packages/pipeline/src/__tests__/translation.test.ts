import { describe, expect, it } from "vitest"
import type { AppConfig, TextClassificationOutput } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  getBaseLanguage,
  shouldTranslate,
  buildTranslationConfig,
  translatePageText,
} from "../translation.js"

const sampleClassification: TextClassificationOutput = {
  reasoning: "Detected grouped text.",
  groups: [
    {
      groupId: "pg001_gp001",
      groupType: "paragraph",
      texts: [
        { textType: "section_text", text: "Hello world", isPruned: false },
        { textType: "instruction_text", text: "Read this aloud.", isPruned: false },
      ],
    },
  ],
}

function makeFakeLLMModel(
  translations: string[],
  onCall?: (options: GenerateObjectOptions) => void
): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      onCall?.(options)
      return {
        object: { translations } as T,
        usage: { inputTokens: 10, outputTokens: 10 },
      } as GenerateObjectResult<T>
    },
  }
}

describe("translation", () => {
  it("extracts base language from locale variants", () => {
    expect(getBaseLanguage("en_US")).toBe("en")
    expect(getBaseLanguage("pt-br")).toBe("pt")
    expect(getBaseLanguage("ES")).toBe("es")
  })

  it("determines when translation is required", () => {
    expect(shouldTranslate("en", "en")).toBe(false)
    expect(shouldTranslate("en_US", "en-GB")).toBe(false)
    expect(shouldTranslate("es", "en")).toBe(true)
    expect(shouldTranslate(null, "en")).toBe(false)
    expect(shouldTranslate("en", undefined)).toBe(false)
  })

  it("builds translation config from app config", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      editing_language: "fr",
      text_classification: { model: "openai:gpt-4.1-mini" },
      translation: { prompt: "custom_translation", model: "openai:gpt-5.2" },
    }

    const config = buildTranslationConfig(appConfig, "en")
    expect(config).toEqual({
      sourceLanguage: "en",
      targetLanguage: "fr",
      promptName: "custom_translation",
      modelId: "openai:gpt-5.2",
    })
  })

  it("returns null translation config when source and target base languages match", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      editing_language: "en-GB",
    }

    expect(buildTranslationConfig(appConfig, "en_US")).toBeNull()
  })

  it("translates all text entries and preserves structure", async () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      editing_language: "fr",
    }
    const config = buildTranslationConfig(appConfig, "en")
    expect(config).not.toBeNull()

    let capturedOptions: GenerateObjectOptions | null = null
    const llmModel = makeFakeLLMModel(
      ["Bonjour le monde", "Lisez ceci a voix haute."],
      (options) => {
        capturedOptions = options
      }
    )

    const translated = await translatePageText(
      "pg001",
      sampleClassification,
      config!,
      llmModel
    )

    expect(capturedOptions?.prompt).toBe("translation")
    expect((capturedOptions?.context?.texts as Array<{ text: string }>).map((t) => t.text)).toEqual([
      "Hello world",
      "Read this aloud.",
    ])
    expect(translated.groups[0].texts[0].text).toBe("Bonjour le monde")
    expect(translated.groups[0].texts[1].text).toBe("Lisez ceci a voix haute.")
    expect(translated.groups[0].groupId).toBe("pg001_gp001")
    expect(translated.groups[0].texts[0].isPruned).toBe(false)
    expect(translated.reasoning).toContain("Translated from en to fr.")
    expect(translated.reasoning).toContain("Original reasoning: Detected grouped text.")
  })

  it("enforces translation count validation", async () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      editing_language: "fr",
    }
    const config = buildTranslationConfig(appConfig, "en")
    expect(config).not.toBeNull()

    let capturedOptions: GenerateObjectOptions | null = null
    const llmModel = makeFakeLLMModel(["Bonjour"], (options) => {
      capturedOptions = options
    })

    await translatePageText("pg001", sampleClassification, config!, llmModel)

    const validation = capturedOptions?.validate?.(
      { translations: ["Only one"] },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("Expected 2 translations but got 1")
  })

  it("returns original data when there are no text entries", async () => {
    const emptyClassification: TextClassificationOutput = {
      reasoning: "No text found.",
      groups: [
        {
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [],
        },
      ],
    }
    const config = {
      sourceLanguage: "en",
      targetLanguage: "fr",
      promptName: "translation",
      modelId: "openai:gpt-4.1",
    }

    let called = false
    const llmModel: LLMModel = {
      generateObject: async <T>() => {
        called = true
        return { object: { translations: [] } as T }
      },
    }

    const result = await translatePageText(
      "pg001",
      emptyClassification,
      config,
      llmModel
    )

    expect(result).toBe(emptyClassification)
    expect(called).toBe(false)
  })
})
