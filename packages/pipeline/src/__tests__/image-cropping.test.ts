import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  buildCroppingConfig,
  cropPageImages,
  applyCrop,
  applyCrops,
} from "../image-cropping.js"
import { PNG } from "pngjs"

function makeFakeLLMModel(
  images: Array<{
    image_id: string
    reasoning: string
    should_crop: boolean
    crop_left: number
    crop_top: number
    crop_right: number
    crop_bottom: number
  }>,
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

function createTestPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  // Fill with red pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      png.data[idx] = 255     // R
      png.data[idx + 1] = 0   // G
      png.data[idx + 2] = 0   // B
      png.data[idx + 3] = 255 // A
    }
  }
  return PNG.sync.write(png)
}

describe("buildCroppingConfig", () => {
  it("returns null when cropping not in image_filters", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
    }
    expect(buildCroppingConfig(appConfig)).toBeNull()
  })

  it("returns null when cropping is false", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: { cropping: false },
      image_cropping: { model: "openai:gpt-4.1" },
    }
    expect(buildCroppingConfig(appConfig)).toBeNull()
  })

  it("returns null when cropping is true but no model set", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: { cropping: true },
    }
    expect(buildCroppingConfig(appConfig)).toBeNull()
  })

  it("returns config when cropping enabled and image_cropping model set", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: { cropping: true },
      image_cropping: { model: "openai:gpt-4.1" },
    }
    const config = buildCroppingConfig(appConfig)
    expect(config).not.toBeNull()
    expect(config!.promptName).toBe("image_cropping")
    expect(config!.modelId).toBe("openai:gpt-4.1")
  })

  it("falls back to image_meaningfulness model", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: { cropping: true },
      image_meaningfulness: { model: "openai:gpt-4.1" },
    }
    const config = buildCroppingConfig(appConfig)
    expect(config).not.toBeNull()
    expect(config!.modelId).toBe("openai:gpt-4.1")
  })

  it("uses explicit prompt name when provided", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main body text" },
      text_group_types: { paragraph: "Paragraph" },
      image_filters: { cropping: true },
      image_cropping: { model: "openai:gpt-4.1", prompt: "custom_crop" },
    }
    const config = buildCroppingConfig(appConfig)
    expect(config!.promptName).toBe("custom_crop")
  })
})

describe("cropPageImages", () => {
  const config = { promptName: "image_cropping", modelId: "openai:gpt-4.1" }

  it("returns empty crops when no images", async () => {
    const llm = makeFakeLLMModel([])
    const result = await cropPageImages(
      { pageId: "pg001", pageImageBase64: "base64page", images: [] },
      config,
      llm
    )
    expect(result.crops).toEqual([])
  })

  it("returns crop info for each image", async () => {
    const llm = makeFakeLLMModel([
      {
        image_id: "pg001_im001",
        reasoning: "Stray text at top",
        should_crop: true,
        crop_left: 0,
        crop_top: 20,
        crop_right: 100,
        crop_bottom: 100,
      },
      {
        image_id: "pg001_im002",
        reasoning: "Image looks clean",
        should_crop: false,
        crop_left: 0,
        crop_top: 0,
        crop_right: 200,
        crop_bottom: 200,
      },
    ])

    const result = await cropPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
          { imageId: "pg001_im002", imageBase64: "base64b", width: 200, height: 200 },
        ],
      },
      config,
      llm
    )

    expect(result.crops).toHaveLength(2)
    expect(result.crops[0]).toEqual({
      imageId: "pg001_im001",
      reasoning: "Stray text at top",
      shouldCrop: true,
      cropLeft: 0,
      cropTop: 20,
      cropRight: 100,
      cropBottom: 100,
    })
    expect(result.crops[1]).toEqual({
      imageId: "pg001_im002",
      reasoning: "Image looks clean",
      shouldCrop: false,
    })
  })

  it("sends correct context to LLM", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [{
        image_id: "pg001_im001",
        reasoning: "Clean",
        should_crop: false,
        crop_left: 0,
        crop_top: 0,
        crop_right: 100,
        crop_bottom: 100,
      }],
      (options) => { capturedOptions = options }
    )

    await cropPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
        ],
      },
      config,
      llm
    )

    expect(capturedOptions?.prompt).toBe("image_cropping")
    expect(capturedOptions?.context?.page_image_base64).toBe("base64page")
    expect(capturedOptions?.context?.images).toHaveLength(1)
    expect(capturedOptions?.log?.taskType).toBe("image-cropping")
    expect(capturedOptions?.log?.pageId).toBe("pg001")
  })

  it("validates missing image IDs", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [{
        image_id: "pg001_im001",
        reasoning: "Clean",
        should_crop: false,
        crop_left: 0,
        crop_top: 0,
        crop_right: 100,
        crop_bottom: 100,
      }],
      (options) => { capturedOptions = options }
    )

    await cropPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
          { imageId: "pg001_im002", imageBase64: "base64b", width: 200, height: 200 },
        ],
      },
      config,
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        images: [{
          image_id: "pg001_im001",
          reasoning: "r",
          should_crop: false,
          crop_left: 0,
          crop_top: 0,
          crop_right: 100,
          crop_bottom: 100,
        }],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("pg001_im002")
  })

  it("validates invalid crop coordinates", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [{
        image_id: "pg001_im001",
        reasoning: "Crop it",
        should_crop: true,
        crop_left: 0,
        crop_top: 0,
        crop_right: 100,
        crop_bottom: 100,
      }],
      (options) => { capturedOptions = options }
    )

    await cropPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
        ],
      },
      config,
      llm
    )

    // crop_right <= crop_left
    const validation = capturedOptions?.validate?.(
      {
        images: [{
          image_id: "pg001_im001",
          reasoning: "r",
          should_crop: true,
          crop_left: 50,
          crop_top: 0,
          crop_right: 30,
          crop_bottom: 100,
        }],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("crop_right")
  })

  it("validates crop coordinates exceeding image dimensions", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [{
        image_id: "pg001_im001",
        reasoning: "Crop it",
        should_crop: true,
        crop_left: 0,
        crop_top: 0,
        crop_right: 100,
        crop_bottom: 100,
      }],
      (options) => { capturedOptions = options }
    )

    await cropPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
        ],
      },
      config,
      llm
    )

    const validation = capturedOptions?.validate?.(
      {
        images: [{
          image_id: "pg001_im001",
          reasoning: "r",
          should_crop: true,
          crop_left: 0,
          crop_top: 0,
          crop_right: 150,
          crop_bottom: 100,
        }],
      },
      {}
    )
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("exceeds image width")
  })

  it("skips coordinate validation for non-cropped images", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llm = makeFakeLLMModel(
      [{
        image_id: "pg001_im001",
        reasoning: "Clean",
        should_crop: false,
        crop_left: 0,
        crop_top: 0,
        crop_right: 100,
        crop_bottom: 100,
      }],
      (options) => { capturedOptions = options }
    )

    await cropPageImages(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 100, height: 100 },
        ],
      },
      config,
      llm
    )

    // Invalid coordinates but should_crop is false, so validation passes
    const validation = capturedOptions?.validate?.(
      {
        images: [{
          image_id: "pg001_im001",
          reasoning: "r",
          should_crop: false,
          crop_left: 50,
          crop_top: 0,
          crop_right: 30,
          crop_bottom: 100,
        }],
      },
      {}
    )
    expect(validation?.valid).toBe(true)
  })
})

describe("applyCrop", () => {
  it("crops a PNG image", () => {
    const png = createTestPng(100, 100)
    const cropped = applyCrop(png, {
      cropLeft: 10,
      cropTop: 10,
      cropRight: 50,
      cropBottom: 50,
    })

    // Verify it's a valid PNG
    expect(cropped[0]).toBe(0x89)
    expect(cropped[1]).toBe(0x50)

    // Verify dimensions
    const decoded = PNG.sync.read(cropped)
    expect(decoded.width).toBe(40)
    expect(decoded.height).toBe(40)
  })

  it("returns original buffer when crop dimensions are invalid", () => {
    const png = createTestPng(100, 100)
    const result = applyCrop(png, {
      cropLeft: 50,
      cropTop: 0,
      cropRight: 30,
      cropBottom: 100,
    })
    expect(result).toBe(png)
  })
})

describe("applyCrops", () => {
  it("returns cropped buffers for images that should be cropped", () => {
    const png = createTestPng(100, 100)
    const base64 = png.toString("base64")

    const result = applyCrops(
      {
        crops: [
          {
            imageId: "img001",
            reasoning: "Stray text",
            shouldCrop: true,
            cropLeft: 10,
            cropTop: 10,
            cropRight: 90,
            cropBottom: 90,
          },
          {
            imageId: "img002",
            reasoning: "Clean",
            shouldCrop: false,
          },
        ],
      },
      () => base64
    )

    expect(result).toHaveLength(1)
    expect(result[0].imageId).toBe("img001")
    expect(result[0].width).toBe(80)
    expect(result[0].height).toBe(80)

    // Verify the cropped buffer is a valid PNG
    const decoded = PNG.sync.read(result[0].buffer)
    expect(decoded.width).toBe(80)
    expect(decoded.height).toBe(80)
  })

  it("returns empty array when no images need cropping", () => {
    const result = applyCrops(
      {
        crops: [
          {
            imageId: "img001",
            reasoning: "Clean",
            shouldCrop: false,
          },
        ],
      },
      () => "base64"
    )
    expect(result).toHaveLength(0)
  })
})
