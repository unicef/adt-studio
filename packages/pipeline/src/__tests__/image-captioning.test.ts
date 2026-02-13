import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  extractImageIds,
  buildCaptionConfig,
  captionPageImages,
} from "../image-captioning.js"

function makeFakeLLMModel(
  captions: Array<{ image_id: string; reasoning: string; caption: string }>,
  onCall?: (options: GenerateObjectOptions) => void
): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      onCall?.(options)
      return {
        object: { captions } as T,
        usage: { inputTokens: 100, outputTokens: 50 },
      } as GenerateObjectResult<T>
    },
  }
}

describe("extractImageIds", () => {
  it("extracts data-id from img tags", () => {
    const html = [
      '<section><img src="/api/books/test/images/pg001_im001" data-id="pg001_im001" alt="photo" /></section>',
    ]
    expect(extractImageIds(html)).toEqual(["pg001_im001"])
  })

  it("extracts from multiple sections", () => {
    const html = [
      '<section><img data-id="pg001_im001" src="x" /></section>',
      '<section><img data-id="pg001_im002" src="y" /></section>',
    ]
    const ids = extractImageIds(html)
    expect(ids).toContain("pg001_im001")
    expect(ids).toContain("pg001_im002")
    expect(ids).toHaveLength(2)
  })

  it("deduplicates image IDs across sections", () => {
    const html = [
      '<section><img data-id="pg001_im001" src="x" /></section>',
      '<section><img data-id="pg001_im001" src="x" /></section>',
    ]
    expect(extractImageIds(html)).toEqual(["pg001_im001"])
  })

  it("returns empty array when no img tags exist", () => {
    const html = [
      "<section><p data-id=\"text1\">Hello</p></section>",
    ]
    expect(extractImageIds(html)).toEqual([])
  })

  it("ignores img tags without data-id", () => {
    const html = [
      '<section><img src="placeholder.png" alt="no data-id" /></section>',
    ]
    expect(extractImageIds(html)).toEqual([])
  })

  it("ignores data-id on non-img tags", () => {
    const html = [
      '<section><p data-id="pg001_im001">text</p></section>',
    ]
    expect(extractImageIds(html)).toEqual([])
  })

  it("handles empty sections array", () => {
    expect(extractImageIds([])).toEqual([])
  })

  it("handles multiple images in one section", () => {
    const html = [
      '<section><img data-id="im1" src="a" /><p>text</p><img data-id="im2" src="b" /></section>',
    ]
    const ids = extractImageIds(html)
    expect(ids).toContain("im1")
    expect(ids).toContain("im2")
    expect(ids).toHaveLength(2)
  })
})

describe("buildCaptionConfig", () => {
  it("uses defaults when no image_captioning config", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
    }
    const config = buildCaptionConfig(appConfig)
    expect(config.promptName).toBe("image_captioning")
    expect(config.modelId).toBe("openai:gpt-4.1")
  })

  it("falls back to text_classification model", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      text_classification: { model: "openai:gpt-5.2" },
    }
    const config = buildCaptionConfig(appConfig)
    expect(config.modelId).toBe("openai:gpt-5.2")
  })

  it("uses explicit image_captioning config", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_captioning: {
        prompt: "custom_caption",
        model: "openai:gpt-5.2",
      },
    }
    const config = buildCaptionConfig(appConfig)
    expect(config.promptName).toBe("custom_caption")
    expect(config.modelId).toBe("openai:gpt-5.2")
  })
})

describe("captionPageImages", () => {
  it("returns empty captions for pages with no images", async () => {
    const llm = makeFakeLLMModel([])
    const result = await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64pageimage",
        images: [],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )
    expect(result.captions).toEqual([])
  })

  it("sends images to LLM and returns captions", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [
        {
          image_id: "pg001_im001",
          reasoning: "Shows a diagram of the water cycle",
          caption: "The water cycle showing evaporation and condensation",
        },
      ],
      (options) => {
        capturedOptions = options
      }
    )

    const result = await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64pageimage",
        images: [{ imageId: "pg001_im001", imageBase64: "base64img1" }],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )

    expect(capturedOptions?.prompt).toBe("image_captioning")
    expect(capturedOptions?.context?.language).toBe("en")
    expect(capturedOptions?.context?.page_image_base64).toBe("base64pageimage")
    expect(capturedOptions?.log?.taskType).toBe("image-captioning")
    expect(capturedOptions?.log?.pageId).toBe("pg001")

    expect(result.captions).toHaveLength(1)
    expect(result.captions[0]).toEqual({
      imageId: "pg001_im001",
      reasoning: "Shows a diagram of the water cycle",
      caption: "The water cycle showing evaporation and condensation",
    })
  })

  it("handles multiple images per page", async () => {
    const llm = makeFakeLLMModel([
      {
        image_id: "pg001_im001",
        reasoning: "A photo",
        caption: "A child reading a book",
      },
      {
        image_id: "pg001_im002",
        reasoning: "A diagram",
        caption: "Parts of a plant",
      },
    ])

    const result = await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a" },
          { imageId: "pg001_im002", imageBase64: "base64b" },
        ],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )

    expect(result.captions).toHaveLength(2)
    expect(result.captions[0].imageId).toBe("pg001_im001")
    expect(result.captions[1].imageId).toBe("pg001_im002")
  })

  it("validates that all image IDs are captioned", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [
        {
          image_id: "pg001_im001",
          reasoning: "A photo",
          caption: "A caption",
        },
      ],
      (options) => {
        capturedOptions = options
      }
    )

    await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a" },
          { imageId: "pg001_im002", imageBase64: "base64b" },
        ],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )

    // Simulate validation with missing image
    const validation = capturedOptions?.validate?.(
      {
        captions: [
          { image_id: "pg001_im001", reasoning: "r", caption: "c" },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("pg001_im002")
  })

  it("validates no extra image IDs returned", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [
        {
          image_id: "pg001_im001",
          reasoning: "A photo",
          caption: "A caption",
        },
      ],
      (options) => {
        capturedOptions = options
      }
    )

    await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [{ imageId: "pg001_im001", imageBase64: "base64a" }],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        captions: [
          { image_id: "pg001_im001", reasoning: "r", caption: "c" },
          { image_id: "pg001_im999", reasoning: "r", caption: "c" },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("pg001_im999")
  })

  it("passes validation when all IDs match", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [
        {
          image_id: "pg001_im001",
          reasoning: "r",
          caption: "c",
        },
      ],
      (options) => {
        capturedOptions = options
      }
    )

    await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [{ imageId: "pg001_im001", imageBase64: "base64a" }],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        captions: [
          { image_id: "pg001_im001", reasoning: "r", caption: "c" },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(true)
    expect(validation?.errors).toEqual([])
  })

  it("validates duplicate image IDs in LLM output", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [
        {
          image_id: "pg001_im001",
          reasoning: "r",
          caption: "c",
        },
      ],
      (options) => {
        capturedOptions = options
      }
    )

    await captionPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [{ imageId: "pg001_im001", imageBase64: "base64a" }],
        language: "en",
      },
      { promptName: "image_captioning", modelId: "openai:gpt-4.1" },
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        captions: [
          { image_id: "pg001_im001", reasoning: "r", caption: "c1" },
          { image_id: "pg001_im001", reasoning: "r", caption: "c2" },
        ],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors.some((e) => e.includes("Duplicate image IDs"))).toBe(true)
  })
})
