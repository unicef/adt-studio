import { describe, it, expect } from "vitest"
import { generateBookSummary, buildBookSummaryConfig } from "../book-summary.js"
import type { BookSummaryConfig, BookSummaryPageInput } from "../book-summary.js"
import type { BookSummaryOutput, AppConfig } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"

function makeFakeLLMModel(response: BookSummaryOutput): LLMModel {
  return {
    generateObject: async <T>() => ({
      object: response as T,
      usage: { inputTokens: 100, outputTokens: 50 },
    }) as GenerateObjectResult<T>,
  }
}

const sampleSummary: BookSummaryOutput = {
  summary: "A short summary of the book.",
}

describe("generateBookSummary", () => {
  const config: BookSummaryConfig = {
    promptName: "book_summary",
    modelId: "openai:gpt-4o",
    outputLanguage: "fr-FR",
  }

  it("returns summary from LLM", async () => {
    const pages: BookSummaryPageInput[] = [
      { pageNumber: 1, text: "Sample page text" },
    ]

    const result = await generateBookSummary(
      pages,
      config,
      makeFakeLLMModel(sampleSummary)
    )

    expect(result).toEqual(sampleSummary)
  })

  it("throws when no pages provided", async () => {
    await expect(
      generateBookSummary(
        [],
        config,
        makeFakeLLMModel(sampleSummary)
      )
    ).rejects.toThrow("No pages provided for book summary")
  })

  it("passes output language context to prompt", async () => {
    const pages: BookSummaryPageInput[] = [
      { pageNumber: 1, text: "Page one" },
      { pageNumber: 2, text: "Page two" },
    ]

    let capturedOptions: unknown
    const llmModel: LLMModel = {
      generateObject: async <T>(options: unknown) => {
        capturedOptions = options
        return {
          object: sampleSummary as T,
          usage: { inputTokens: 100, outputTokens: 50 },
        } as GenerateObjectResult<T>
      },
    }

    await generateBookSummary(pages, config, llmModel)

    const opts = capturedOptions as GenerateObjectOptions
    const ctx = opts.context as {
      pages: BookSummaryPageInput[]
      output_language_code: string
      output_language: string
    }
    expect(opts.prompt).toBe("book_summary")
    expect(ctx.pages).toHaveLength(2)
    expect(ctx.output_language_code).toBe("fr-FR")
    expect(ctx.output_language).toBe("French (France)")
  })
})

describe("buildBookSummaryConfig", () => {
  it("extracts prompt/model/output language from AppConfig", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      editing_language: "pt_br",
      book_summary: { prompt: "custom_summary", model: "openai:gpt-4.1-mini" },
    }

    const config = buildBookSummaryConfig(appConfig)
    expect(config.promptName).toBe("custom_summary")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
    expect(config.outputLanguage).toBe("pt-BR")
  })

  it("defaults prompt/model/output language", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const config = buildBookSummaryConfig(appConfig)
    expect(config.promptName).toBe("book_summary")
    expect(config.modelId).toBe("openai:gpt-5.2")
    expect(config.outputLanguage).toBe("en")
  })
})
