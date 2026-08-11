import { describe, expect, it } from "vitest"
import type { AppConfig, ImageClassificationOutput } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  addFigureExtractionContext,
  buildMeaningfulnessConfig,
  deduplicateAutoFigureCandidates,
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
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
    }
    expect(buildMeaningfulnessConfig(appConfig)).toBeNull()
  })

  it("returns null when image_meaningfulness has no model", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_meaningfulness: { prompt: "custom_prompt" },
    }
    expect(buildMeaningfulnessConfig(appConfig)).toBeNull()
  })

  it("returns config with defaults when model is set", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
    }
    const config = buildMeaningfulnessConfig(appConfig)
    expect(config).not.toBeNull()
    expect(config!.promptName).toBe("image_meaningfulness")
    expect(config!.modelId).toBe("openai:gpt-4.1")
    expect(config!.maxRetries).toBe(5)
    expect(config!.figureExtractionMode).toBe("all")
  })

  it("uses explicit prompt name when provided", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_meaningfulness: {
        model: "openai:gpt-4.1",
        prompt: "custom_meaningfulness",
        max_retries: 13,
      },
    }
    const config = buildMeaningfulnessConfig(appConfig)
    expect(config!.promptName).toBe("custom_meaningfulness")
    expect(config!.modelId).toBe("openai:gpt-4.1")
    expect(config!.maxRetries).toBe(13)
  })

  it("returns null when image_filters.meaningfulness is false", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
      image_filters: { meaningfulness: false },
    }
    expect(buildMeaningfulnessConfig(appConfig)).toBeNull()
  })

  it("returns config when image_filters.meaningfulness is true", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
      image_filters: { meaningfulness: true },
    }
    expect(buildMeaningfulnessConfig(appConfig)).not.toBeNull()
  })

  it("passes the explicit auto figure extraction mode to the prompt config", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main body text" },
      structure_types: { paragraph: "Paragraph" },
      image_meaningfulness: { model: "openai:gpt-4.1" },
      figure_extraction_mode: "auto",
    }
    expect(buildMeaningfulnessConfig(appConfig)?.figureExtractionMode).toBe("auto")
  })
})

describe("addFigureExtractionContext", () => {
  it("attaches selectable-text and raster evidence to matching candidates", () => {
    const images = addFigureExtractionContext(
      [{
        imageId: "pg001_im001",
        imageBase64: "image",
        width: 200,
        height: 100,
        renderMethod: "page-crop",
      }],
      {
        pageId: "pg001",
        totalShapes: 4,
        totalTextShapes: 2,
        totalVectorShapes: 1,
        totalImageShapes: 1,
        backgroundsFiltered: 0,
        groupsBeforeMerge: 1,
        groupsAfterMerge: 1,
        textOnlyGroupsSkipped: 0,
        tooSmallGroupsSkipped: 0,
        groups: [{
          imageId: "pg001_im001",
          groupIndex: 1,
          shapeCount: 4,
          shapes: [
            { type: "text", bbox: [0, 0, 10, 10], textLength: 5 },
            { type: "text", bbox: [10, 0, 20, 10], textLength: 5 },
            { type: "vector", bbox: [0, 0, 20, 20] },
            { type: "image", bbox: [0, 0, 20, 20] },
          ],
          groupBbox: [0, 0, 20, 20],
          hasImages: true,
          hasText: true,
          hasNonText: true,
          renderMethod: "page-crop",
          renderReason: "test",
        }],
      },
    )

    expect(images[0].figureContext).toEqual({
      hasSelectableText: true,
      hasRasterContent: true,
      shapeCount: 4,
      textShapeCount: 2,
      vectorShapeCount: 1,
    })
  })

  it("cross-links composites and their covered standalones, restricted to supplied images", () => {
    const debug = {
      pageId: "pg001",
      totalShapes: 4,
      totalTextShapes: 0,
      totalVectorShapes: 1,
      totalImageShapes: 2,
      backgroundsFiltered: 0,
      groupsBeforeMerge: 1,
      groupsAfterMerge: 1,
      textOnlyGroupsSkipped: 0,
      tooSmallGroupsSkipped: 0,
      groups: [{
        imageId: "pg001_im003",
        groupIndex: 1,
        shapeCount: 3,
        shapes: [
          { type: "vector" as const, bbox: [0, 0, 20, 20] as [number, number, number, number] },
          { type: "image" as const, bbox: [0, 0, 20, 20] as [number, number, number, number] },
          { type: "image" as const, bbox: [20, 0, 40, 20] as [number, number, number, number] },
        ],
        groupBbox: [0, 0, 40, 20] as [number, number, number, number],
        hasImages: true,
        hasText: false,
        hasNonText: true,
        renderMethod: "page-crop" as const,
        renderReason: "test",
        // im002 was pruned before meaningfulness, so it is absent from the
        // input and must not be referenced in either direction.
        coveredRasterImageIds: ["pg001_im001", "pg001_im002"],
      }],
    }

    const images = addFigureExtractionContext(
      [
        { imageId: "pg001_im001", imageBase64: "photo", width: 100, height: 100 },
        { imageId: "pg001_im003", imageBase64: "composite", width: 200, height: 100 },
      ],
      debug,
    )

    expect(images[0].containedInFigureId).toBe("pg001_im003")
    expect(images[0].figureContext).toBeUndefined()
    expect(images[1].figureContext?.coveredImageIds).toEqual(["pg001_im001"])
    expect(images[1].containedInFigureId).toBeUndefined()
  })
})

describe("deduplicateAutoFigureCandidates", () => {
  const debug = {
    pageId: "pg001",
    totalShapes: 2,
    totalTextShapes: 0,
    totalVectorShapes: 1,
    totalImageShapes: 1,
    backgroundsFiltered: 0,
    groupsBeforeMerge: 1,
    groupsAfterMerge: 1,
    textOnlyGroupsSkipped: 0,
    tooSmallGroupsSkipped: 0,
    groups: [{
      imageId: "pg001_im002",
      groupIndex: 1,
      shapeCount: 2,
      shapes: [],
      groupBbox: [0, 0, 20, 20] as [number, number, number, number],
      hasImages: true,
      hasText: false,
      hasNonText: true,
      renderMethod: "page-crop" as const,
      renderReason: "test",
      coveredRasterImageIds: ["pg001_im001"],
    }],
  }

  it("keeps a surviving composite and prunes its covered standalone", () => {
    const result = deduplicateAutoFigureCandidates({
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }, debug)

    expect(result.images).toEqual([
      {
        imageId: "pg001_im001",
        isPruned: true,
        reason: "duplicate artwork: kept composite pg001_im002",
      },
      { imageId: "pg001_im002", isPruned: false },
    ])
  })

  it("keeps the standalone when the composite was already pruned", () => {
    const classification: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: true, reason: "not meaningful" },
      ],
    }

    expect(deduplicateAutoFigureCandidates(classification, debug)).toBe(classification)
  })
})

describe("filterPageImageMeaningfulness", () => {
  const config = {
    promptName: "image_meaningfulness",
    modelId: "openai:gpt-4.1",
    maxRetries: 5,
    figureExtractionMode: "all" as const,
  }

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
    expect(capturedOptions?.context?.figure_extraction_mode).toBe("all")
    expect(capturedOptions?.context?.images).toHaveLength(1)
    expect(capturedOptions?.context?.images[0].imageId).toBe("pg001_im001")
    expect(capturedOptions?.log?.taskType).toBe("image-meaningfulness")
    expect(capturedOptions?.log?.pageId).toBe("pg001")
  })

  it("downgrades the template mode to all on Auto pages with no figure candidates", async () => {
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
        pageText: "page text",
        images: [
          { imageId: "pg001_im001", imageBase64: "base64a", width: 300, height: 400 },
        ],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm
    )

    expect(capturedOptions?.context?.figure_extraction_mode).toBe("all")
  })

  it("keeps the auto template mode when the page has a figure candidate", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel(
      [{ image_id: "pg001_im001", reasoning: "A chart", is_meaningful: true }],
      (options) => { capturedOptions = options }
    )

    await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "base64page",
        pageText: "page text",
        images: [{
          imageId: "pg001_im001",
          imageBase64: "base64a",
          width: 300,
          height: 400,
          figureContext: {
            hasSelectableText: true,
            hasRasterContent: true,
            shapeCount: 3,
            textShapeCount: 1,
            vectorShapeCount: 1,
          },
        }],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm
    )

    expect(capturedOptions?.context?.figure_extraction_mode).toBe("auto")
  })

  it("uses a transparent Auto reason when a candidate is better represented as HTML", async () => {
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel([{
      image_id: "pg001_im001",
      reasoning: "Selectable heading text in a simple colored rectangle",
      is_meaningful: false,
    }])

    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "page",
        pageText: "Chapter 1",
        images: [{
          imageId: "pg001_im001",
          imageBase64: "heading",
          width: 500,
          height: 80,
          figureContext: {
            hasSelectableText: true,
            hasRasterContent: false,
            shapeCount: 3,
            textShapeCount: 1,
            vectorShapeCount: 2,
          },
        }],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm,
    )

    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: true,
      reason: "auto figure filter: Selectable heading text in a simple colored rectangle",
    })
  })

  it("protects Auto candidates without selectable-text evidence", async () => {
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel([{
      image_id: "pg001_im001",
      reasoning: "Looks text-heavy",
      is_meaningful: false,
    }])

    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "page",
        images: [{
          imageId: "pg001_im001",
          imageBase64: "scan",
          width: 500,
          height: 500,
          figureContext: {
            hasSelectableText: false,
            hasRasterContent: true,
            shapeCount: 1,
            textShapeCount: 0,
            vectorShapeCount: 0,
          },
        }],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm,
    )

    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: false,
      reason: "auto guard kept: raster artwork with no selectable-text copy and no surviving standalone duplicate (LLM: Looks text-heavy)",
    })
  })

  it("lets Auto prune a rejected composite when its standalone copy survives", async () => {
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }
    const llm = makeFakeLLMModel([
      {
        image_id: "pg001_im001",
        reasoning: "The crop only adds a heading around the photo",
        is_meaningful: false,
      },
      {
        image_id: "pg001_im002",
        reasoning: "Standalone photo is the better representation",
        is_meaningful: true,
      },
    ])

    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "page",
        images: [
          {
            imageId: "pg001_im001",
            imageBase64: "composite",
            width: 600,
            height: 400,
            figureContext: {
              hasSelectableText: false,
              hasRasterContent: true,
              shapeCount: 2,
              textShapeCount: 0,
              vectorShapeCount: 1,
              coveredImageIds: ["pg001_im002"],
            },
          },
          {
            imageId: "pg001_im002",
            imageBase64: "photo",
            width: 400,
            height: 300,
            containedInFigureId: "pg001_im001",
          },
        ],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm,
    )

    expect(result.images).toEqual([
      {
        imageId: "pg001_im001",
        isPruned: true,
        reason: "auto figure filter: The crop only adds a heading around the photo",
      },
      { imageId: "pg001_im002", isPruned: false },
    ])
  })

  it("prunes a surviving standalone as a duplicate when its composite is also kept", async () => {
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }
    const llm = makeFakeLLMModel([
      {
        image_id: "pg001_im001",
        reasoning: "Diagram with intrinsic labels",
        is_meaningful: true,
      },
      {
        image_id: "pg001_im002",
        reasoning: "Photo also looks fine on its own",
        is_meaningful: true,
      },
    ])

    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "page",
        images: [
          {
            imageId: "pg001_im001",
            imageBase64: "composite",
            width: 600,
            height: 400,
            figureContext: {
              hasSelectableText: true,
              hasRasterContent: true,
              shapeCount: 5,
              textShapeCount: 2,
              vectorShapeCount: 2,
              coveredImageIds: ["pg001_im002"],
            },
          },
          {
            imageId: "pg001_im002",
            imageBase64: "photo",
            width: 400,
            height: 300,
            containedInFigureId: "pg001_im001",
          },
        ],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm,
    )

    expect(result.images).toEqual([
      { imageId: "pg001_im001", isPruned: false },
      {
        imageId: "pg001_im002",
        isPruned: true,
        reason: "duplicate artwork: kept composite pg001_im001",
      },
    ])
  })

  it("keeps one copy when both the composite and its standalone are rejected without a text copy", async () => {
    const existing: ImageClassificationOutput = {
      images: [
        { imageId: "pg001_im001", isPruned: false },
        { imageId: "pg001_im002", isPruned: false },
      ],
    }
    const llm = makeFakeLLMModel([
      {
        image_id: "pg001_im001",
        reasoning: "Looks like a text-heavy scan",
        is_meaningful: false,
      },
      {
        image_id: "pg001_im002",
        reasoning: "Same scan, rejected as text-heavy",
        is_meaningful: false,
      },
    ])

    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "page",
        images: [
          {
            imageId: "pg001_im001",
            imageBase64: "composite",
            width: 600,
            height: 400,
            figureContext: {
              hasSelectableText: false,
              hasRasterContent: true,
              shapeCount: 2,
              textShapeCount: 0,
              vectorShapeCount: 1,
              coveredImageIds: ["pg001_im002"],
            },
          },
          {
            imageId: "pg001_im002",
            imageBase64: "scan",
            width: 400,
            height: 300,
            containedInFigureId: "pg001_im001",
          },
        ],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm,
    )

    // The composite is guard-kept (no selectable-text copy, no surviving
    // standalone), so the artwork survives exactly once.
    expect(result.images).toEqual([
      {
        imageId: "pg001_im001",
        isPruned: false,
        reason: "auto guard kept: raster artwork with no selectable-text copy and no surviving standalone duplicate (LLM: Looks like a text-heavy scan)",
      },
      {
        imageId: "pg001_im002",
        isPruned: true,
        reason: "not meaningful: Same scan, rejected as text-heavy",
      },
    ])
  })

  it("allows Auto to prune decorative pure-vector candidates without text", async () => {
    const existing: ImageClassificationOutput = {
      images: [{ imageId: "pg001_im001", isPruned: false }],
    }
    const llm = makeFakeLLMModel([{
      image_id: "pg001_im001",
      reasoning: "Empty rounded banner background",
      is_meaningful: false,
    }])

    const result = await filterPageImageMeaningfulness(
      {
        pageId: "pg001",
        pageImageBase64: "page",
        images: [{
          imageId: "pg001_im001",
          imageBase64: "banner",
          width: 500,
          height: 80,
          figureContext: {
            hasSelectableText: false,
            hasRasterContent: false,
            shapeCount: 2,
            textShapeCount: 0,
            vectorShapeCount: 2,
          },
        }],
      },
      existing,
      { ...config, figureExtractionMode: "auto" },
      llm,
    )

    expect(result.images[0]).toEqual({
      imageId: "pg001_im001",
      isPruned: true,
      reason: "auto figure filter: Empty rounded banner background",
    })
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
