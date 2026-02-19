import { describe, expect, it } from "vitest"
import type { AppConfig, ImageClassificationOutput } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  buildMeaningfulnessConfig,
  filterPageImageMeaningfulness,
} from "../image-meaningfulness.js"

function makeFakeLLMModel(
  images: Array<{ image_id: string; reasoning: string; is_meaningful: boolean }>,
  onCall?: (options: GenerateObjectOptions) => void
): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      onCall?.(options)
      return {
        object: { images } as T,
        usage: { inputTokens: 100, outputTokens: 50 },
      } as GenerateObjectResult<T>
    },
  }
}

describe("buildMeaningfulnessConfig", () => {
  it("returns null when no image_meaningfulness config", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
    }
    expect(buildMeaningfulnessConfig(appConfig)).toBeNull()
  })

  it("returns null when image_meaningfulness has no model", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_meaningfulness: { prompt: "custom_prompt" },
    }
    expect(buildMeaningfulnessConfig(appConfig)).toBeNull()
  })

  it("returns config with defaults when model is set", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
    }
    const config = buildMeaningfulnessConfig(appConfig)
    expect(config).not.toBeNull()
    expect(config!.promptName).toBe("image_meaningfulness")
    expect(config!.modelId).toBe("openai:gpt-4.1")
  })

  it("uses explicit prompt name when provided", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1", prompt: "custom_meaningfulness" },
    }
    const config = buildMeaningfulnessConfig(appConfig)
    expect(config!.promptName).toBe("custom_meaningfulness")
    expect(config!.modelId).toBe("openai:gpt-4.1")
  })

  it("returns null when image_filters.meaningfulness is false", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
      image_filters: { meaningfulness: false },
    }
    expect(buildMeaningfulnessConfig(appConfig)).toBeNull()
  })

  it("returns config when image_filters.meaningfulness is true", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
      image_filters: { meaningfulness: true },
    }
    expect(buildMeaningfulnessConfig(appConfig)).not.toBeNull()
  })
})

describe("filterPageImageMeaningfulness", () => {
  const config = { promptName: "image_meaningfulness", modelId: "openai:gpt-4.1" }

  it("returns existing classification when no images", async () => {
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: true, reason: "too small" },
      ],
    }
    const llm = makeFakeLLMModel([])
    const result = await filterPageImageMeaningfulness(
      { pageId: "pg001", pageImageBase64: "base64page", images: [] },
      existing,
      config,
      llm
    )
    expect(result).toBe(existing) // same reference, no LLM call
  })

  it("marks non-meaningful images as pruned with reason", async () => {
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }
    const llm = makeFakeLLMModel([
      { image_id: "pg001_im001", reasoning: "Decorative border", is_meaningful: false },
      { image_id: "pg001_im002", reasoning: "Shows a water cycle", is_meaningful: true },
    ])
    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
          { imageId: "pg001_im002", imageBase64: "base64b", width: 200, height: 200 },
        ],
      },
      existing,
      config,
      llm
    )

    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: true,
      reason: "not meaningful: Decorative border",
    })
    expect(result.images[1]).toEqual({
      imageId: "pg001_im002",
      isPruned: false,
    })
  })

  it("preserves already-pruned images", async () => {
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: true, reason: "too small" },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }
    const llm = makeFakeLLMModel([
      { image_id: "pg001_im002", reasoning: "Just a shadow", is_meaningful: false },
    ])
    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im002", imageBase64: "base64b", width: 200, height: 200 },
        ],
      },
      existing,
      config,
      llm
    )

    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: true,
      reason: "too small",
    })
    expect(result.images[1]).toEqual({
      imageId: "pg001_im002",
      isPruned: true,
      reason: "not meaningful: Just a shadow",
    })
  })

  it("sends correct context to LLM", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel(
      [{ image_id: "pg001_im001", reasoning: "A photo", is_meaningful: true }],
      (options) => { capturedOptions = options }
    )

    await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 300, height: 400 },
        ],
      },
      existing,
      config,
      llm
    )

    expect(capturedOptions?.prompt).toBe("image_meaningfulness")
    expect(capturedOptions?.context?.page_image_base64).toBe("base64page")
    expect(capturedOptions?.context?.images).toHaveLength(1)
    expect(capturedOptions?.context?.images[0].imageId).toBe("pg001_im001")
    expect(capturedOptions?.log?.taskType).toBe("image-filtering")
    expect(capturedOptions?.log?.pageId).toBe("pg001")
  })

  it("validates missing image IDs", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }
    const llm = makeFakeLLMModel(
      [{ image_id: "pg001_im001", reasoning: "r", is_meaningful: true }],
      (options) => { capturedOptions = options }
    )

    await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
          { imageId: "pg001_im002", imageBase64: "base64b", width: 100, height: 100 },
        ],
      },
      existing,
      config,
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        images: [
          { image_id: "pg001_im001", reasoning: "r", is_meaningful: true },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("pg001_im002")
  })

  it("validates extra image IDs", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel(
      [{ image_id: "pg001_im001", reasoning: "r", is_meaningful: true }],
      (options) => { capturedOptions = options }
    )

    await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
        ],
      },
      existing,
      config,
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        images: [
          { image_id: "pg001_im001", reasoning: "r", is_meaningful: true },
          { image_id: "pg001_im999", reasoning: "r", is_meaningful: false },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("pg001_im999")
  })

  it("passes validation when all IDs match", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel(
      [{ image_id: "pg001_im001", reasoning: "r", is_meaningful: true }],
      (options) => { capturedOptions = options }
    )

    await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
        ],
      },
      existing,
      config,
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        images: [
          { image_id: "pg001_im001", reasoning: "r", is_meaningful: true },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(true)
    expect(validation?.errors).toEqual([])
  })
})
