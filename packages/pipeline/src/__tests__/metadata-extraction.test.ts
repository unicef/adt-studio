import { describe, it, expect } from "vitest"
import { extractMetadata, buildMetadataConfig } from "../metadata-extraction.js"
import type { MetadataConfig, MetadataPageInput } from "../metadata-extraction.js"
import type { BookMetadata, AppConfig } from "@adt/types"
import type { LLMModel, GenerateObjectOptions, GenerateObjectResult } from "@adt/llm"

function makeFakeLLMModel(response: BookMetadata): LLMModel {
  return {
    generateObject: async <T>() => ({
      object: response as T,
      usage: { inputTokens: 100, outputTokens: 50 },
    }) as GenerateObjectResult<T>,
  }
}

const sampleMetadata: BookMetadata = {
  title: "The Raven",
  authors: ["Edgar Allan Poe"],
  publisher: "Test Publisher",
  language_code: "en",
  cover_page_number: 1,
  reasoning: "The title appears on page 1 with the author name.",
}

describe("extractMetadata", () => {
  const config: MetadataConfig = {
    promptName: "metadata_extraction",
    modelId: "openai:gpt-4o",
  }

  it("returns metadata from LLM", async () => {
    const pages: MetadataPageInput[] = [
      { pageNumber: 1, text: "The Raven by Edgar Allan Poe", imageBase64: "base64data" },
    ]

    const result = await extractMetadata(
      pages,
      config,
      makeFakeLLMModel(sampleMetadata)
    )

    expect(result).toEqual(sampleMetadata)
  })

  it("throws when no pages provided", async () => {
    await expect(
      extractMetadata(
        [],
        config,
        makeFakeLLMModel(sampleMetadata)
      )
    ).rejects.toThrow("No pages provided for metadata extraction")
  })

  it("passes page context via prompt option", async () => {
    const pages: MetadataPageInput[] = [
      { pageNumber: 1, text: "Cover page", imageBase64: "img1" },
      { pageNumber: 2, text: "Title page", imageBase64: "img2" },
      { pageNumber: 3, text: "Copyright page", imageBase64: "img3" },
    ]

    let capturedOptions: unknown
    const llmModel: LLMModel = {
      generateObject: async <T>(options: unknown) => {
        capturedOptions = options
        return {
          object: sampleMetadata as T,
          usage: { inputTokens: 100, outputTokens: 50 },
        } as GenerateObjectResult<T>
      },
    }

    await extractMetadata(pages, config, llmModel)

    const opts = capturedOptions as GenerateObjectOptions
    expect(opts.prompt).toBeDefined()
    expect(opts.prompt!.name).toBe("metadata_extraction")
    const ctx = opts.prompt!.context as { pages: MetadataPageInput[] }
    expect(ctx.pages).toHaveLength(3)
    expect(ctx.pages[0].pageNumber).toBe(1)
    expect(ctx.pages[2].pageNumber).toBe(3)
  })

  it("passes correct log metadata to LLM model", async () => {
    const pages: MetadataPageInput[] = [
      { pageNumber: 1, text: "Test", imageBase64: "data" },
    ]

    let capturedOptions: unknown
    const llmModel: LLMModel = {
      generateObject: async <T>(options: unknown) => {
        capturedOptions = options
        return {
          object: sampleMetadata as T,
          usage: { inputTokens: 100, outputTokens: 50 },
        } as GenerateObjectResult<T>
      },
    }

    await extractMetadata(pages, config, llmModel)

    const opts = capturedOptions as { log: { taskType: string; promptName: string } }
    expect(opts.log.taskType).toBe("metadata")
    expect(opts.log.promptName).toBe("metadata_extraction")
  })
})

describe("buildMetadataConfig", () => {
  it("extracts prompt name from AppConfig", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      metadata: { prompt: "custom_metadata", model: "openai:gpt-4.1-mini" },
    }

    const config = buildMetadataConfig(appConfig)
    expect(config.promptName).toBe("custom_metadata")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
  })

  it("defaults metadata prompt and model", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const config = buildMetadataConfig(appConfig)
    expect(config.promptName).toBe("metadata_extraction")
    expect(config.modelId).toBe("openai:gpt-4o")
  })
})
