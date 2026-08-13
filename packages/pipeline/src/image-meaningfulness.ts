import type {
  AppConfig,
  FigureExtractionMode,
  ImageClassificationOutput,
  RenderMethodValue,
} from "@adt/types"
import {
  imageMeaningfulnessLLMSchema,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import type { ExtractionDebugOutput } from "@adt/pdf"
import type { Storage } from "@adt/storage"
import { resolveFigureExtractionMode } from "./pdf-extraction.js"

export interface FigureExtractionContext {
  /** Selectable PDF text participated in this crop and remains available as page text. */
  hasSelectableText: boolean
  /** The group contains embedded raster artwork, not only vector shapes and text. */
  hasRasterContent: boolean
  shapeCount: number
  textShapeCount: number
  vectorShapeCount: number
  /**
   * imageIds of standalone raster extractions whose artwork this composite
   * contains. Only ids that are also present in the current meaningfulness
   * input are listed, so the LLM is never pointed at an image it cannot see.
   */
  coveredImageIds?: string[]
}

export interface MeaningfulnessImageInput {
  imageId: string
  imageBase64: string
  width: number
  height: number
  renderMethod?: RenderMethodValue
  figureContext?: FigureExtractionContext
  /**
   * Set on a standalone raster whose artwork also appears inside the listed
   * composite candidate (the reverse link of `figureContext.coveredImageIds`).
   */
  containedInFigureId?: string
}

export interface MeaningfulnessPageInput {
  pageId: string
  pageImageBase64: string
  /** Structured text extracted from the PDF; used as evidence that HTML can preserve content. */
  pageText?: string
  images: MeaningfulnessImageInput[]
}

export interface MeaningfulnessConfig {
  promptName: string
  modelId: string
  maxRetries: number
  figureExtractionMode: FigureExtractionMode
}

/** Shared prune reason so both dedup paths stay greppable as one rule. */
function duplicateArtworkReason(compositeId: string): string {
  return `duplicate artwork: kept composite ${compositeId}`
}

/**
 * Resolve extraction-level duplicates when Auto kept both a figure composite
 * and the standalone raster artwork covered by that composite. This local,
 * deterministic pass also runs when the optional LLM meaningfulness filter is
 * disabled or has no configured model.
 */
export function deduplicateAutoFigureCandidates(
  existingClassification: ImageClassificationOutput,
  debug?: ExtractionDebugOutput,
): ImageClassificationOutput {
  if (!debug) return existingClassification

  const entries = existingClassification.images.map((image) => ({ ...image }))
  const byId = new Map(entries.map((image) => [image.imageId, image]))
  let changed = false

  for (const group of debug.groups) {
    const composite = byId.get(group.imageId)
    if (!composite || composite.isPruned) continue

    for (const coveredId of group.coveredRasterImageIds ?? []) {
      const standalone = byId.get(coveredId)
      if (!standalone || standalone.isPruned) continue
      standalone.isPruned = true
      standalone.reason = duplicateArtworkReason(group.imageId)
      changed = true
    }
  }

  return changed ? { ...existingClassification, images: entries } : existingClassification
}

function getExtractionDebug(storage: Storage, pageId: string): ExtractionDebugOutput | undefined {
  return storage.getLatestNodeData("extraction-debug", pageId)?.data as
    | ExtractionDebugOutput
    | undefined
}

/**
 * Run the deterministic auto dedup against the stored extraction debug and
 * persist any change. Returns the (possibly unchanged) classification so
 * callers can keep their own copies in sync.
 */
export function dedupAutoFigureCandidatesInStorage(
  storage: Storage,
  pageId: string,
  existing: ImageClassificationOutput,
): ImageClassificationOutput {
  const updated = deduplicateAutoFigureCandidates(existing, getExtractionDebug(storage, pageId))
  if (updated !== existing) storage.putNodeData("image-filtering", pageId, updated)
  return updated
}

/**
 * Assemble the per-page LLM inputs: unpruned images with their base64
 * payloads, cross-referenced with figure-extraction evidence from the stored
 * extraction debug.
 */
export function buildMeaningfulnessImages(
  storage: Storage,
  pageId: string,
  classification: ImageClassificationOutput,
): MeaningfulnessImageInput[] {
  const unprunedIds = new Set(
    classification.images.filter((img) => !img.isPruned).map((img) => img.imageId)
  )
  const raw = storage
    .getPageImages(pageId)
    .filter((img) => unprunedIds.has(img.imageId))
    .map((img) => ({
      imageId: img.imageId,
      imageBase64: storage.getImageBase64(img.imageId),
      width: img.width,
      height: img.height,
      renderMethod: img.renderMethod,
    }))
  return addFigureExtractionContext(raw, getExtractionDebug(storage, pageId))
}

/** Attach transparent PDF-grouping evidence to the images sent to the LLM. */
export function addFigureExtractionContext(
  images: MeaningfulnessImageInput[],
  debug?: ExtractionDebugOutput,
): MeaningfulnessImageInput[] {
  if (!debug) return images

  const inputIds = new Set(images.map((image) => image.imageId))
  const groupByImageId = new Map(debug.groups.map((group) => [group.imageId, group]))

  // Reverse link: standalone raster id → the composite candidate containing
  // its artwork. Only cross-reference pairs where both sides are in the input,
  // so the LLM is never pointed at an image it cannot see.
  const compositeByCoveredId = new Map<string, string>()
  for (const group of debug.groups) {
    if (!inputIds.has(group.imageId)) continue
    for (const coveredId of group.coveredRasterImageIds ?? []) {
      if (inputIds.has(coveredId)) compositeByCoveredId.set(coveredId, group.imageId)
    }
  }

  return images.map((image) => {
    const group = groupByImageId.get(image.imageId)
    if (!group) {
      const compositeId = compositeByCoveredId.get(image.imageId)
      return compositeId ? { ...image, containedInFigureId: compositeId } : image
    }

    const textShapeCount = group.shapes.filter((shape) => shape.type === "text").length
    const vectorShapeCount = group.shapes.filter((shape) => shape.type === "vector").length
    const coveredImageIds = (group.coveredRasterImageIds ?? []).filter((id) => inputIds.has(id))
    return {
      ...image,
      figureContext: {
        hasSelectableText: group.hasText,
        hasRasterContent: group.hasImages,
        shapeCount: group.shapeCount,
        textShapeCount,
        vectorShapeCount,
        ...(coveredImageIds.length > 0 ? { coveredImageIds } : {}),
      },
    }
  })
}

/**
 * Build meaningfulness config from AppConfig.
 * Returns null when disabled via image_filters.meaningfulness === false or no model set.
 */
export function buildMeaningfulnessConfig(
  appConfig: AppConfig
): MeaningfulnessConfig | null {
  if (appConfig.image_filters?.meaningfulness === false) return null

  const model = appConfig.image_meaningfulness?.model ?? appConfig.default_model
  if (!model) return null

  return {
    promptName: appConfig.image_meaningfulness?.prompt ?? "image_meaningfulness",
    modelId: model,
    figureExtractionMode: resolveFigureExtractionMode(appConfig),
    maxRetries:
      appConfig.image_meaningfulness?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
  }
}

/**
 * Filter non-meaningful images on a page via LLM.
 * Takes the programmatic classification output and the unpruned images,
 * returns updated classification with non-meaningful images marked as pruned.
 *
 * Pure function — no side effects.
 */
export async function filterPageImageMeaningfulness(
  input: MeaningfulnessPageInput,
  existingClassification: ImageClassificationOutput,
  config: MeaningfulnessConfig,
  llmModel: LLMModel
): Promise<ImageClassificationOutput> {
  if (input.images.length === 0) {
    return existingClassification
  }

  const inputImageIds = input.images.map((img) => img.imageId)

  // Auto's long prompt branch (and the page text it cites as evidence) only
  // pays off when the page has composite candidates to arbitrate. On
  // candidate-free pages render the generic branch instead: the auto guard
  // and dedup below key off per-image figure evidence, so they no-op there
  // and only the rendered prompt changes. `page_text` is still passed for
  // custom templates that reference it unconditionally.
  const hasFigureEvidence = input.images.some(
    (img) => img.figureContext || img.containedInFigureId
  )
  const promptMode: FigureExtractionMode =
    config.figureExtractionMode === "auto" && !hasFigureEvidence
      ? "all"
      : config.figureExtractionMode

  const result = await llmModel.generateObject<{
    images: Array<{ image_id: string; reasoning: string; is_meaningful: boolean }>
  }>({
    schema: imageMeaningfulnessLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      page_text: input.pageText ?? "",
      figure_extraction_mode: promptMode,
      images: input.images,
    },
    validate: (raw: unknown): ValidationResult => {
      const r = raw as {
        images: Array<{ image_id: string; reasoning: string; is_meaningful: boolean }>
      }
      const returnedIds = r.images.map((i) => i.image_id)
      const missing = inputImageIds.filter((id) => !returnedIds.includes(id))
      const extra = returnedIds.filter((id) => !inputImageIds.includes(id))
      const errors: string[] = []
      if (missing.length > 0) {
        errors.push(
          `Missing results for image IDs: ${missing.join(", ")}. You must evaluate every image.`
        )
      }
      if (extra.length > 0) {
        errors.push(
          `Unexpected image IDs: ${extra.join(", ")}. Only evaluate the images provided.`
        )
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
    maxTokens: 4096,
    log: {
      taskType: "image-meaningfulness",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  // Build lookup maps from LLM results
  const llmRejectedIds = new Set(
    result.object.images.filter((i) => !i.is_meaningful).map((i) => i.image_id)
  )
  const reasoningMap = new Map(
    result.object.images.map((i) => [i.image_id, i.reasoning])
  )
  const inputById = new Map(input.images.map((image) => [image.imageId, image]))

  const pruneReasons = new Map<string, string>()
  const keepReasons = new Map<string, string>()

  for (const id of llmRejectedIds) {
    const reasoning = reasoningMap.get(id) ?? "LLM filter"
    const figureContext = inputById.get(id)?.figureContext
    if (config.figureExtractionMode !== "auto" || !figureContext) {
      pruneReasons.set(id, `not meaningful: ${reasoning}`)
      continue
    }

    // Auto only vetoes a prune that would lose raster artwork outright:
    // selectable text survives as page text, pure-vector fragments carry no
    // pixel-only content, and a covered standalone that survives this pass
    // keeps the artwork available even when its composite is rejected.
    const hasSurvivingCoveredCopy = (figureContext.coveredImageIds ?? []).some(
      (coveredId) => !llmRejectedIds.has(coveredId)
    )
    if (
      figureContext.hasSelectableText ||
      !figureContext.hasRasterContent ||
      hasSurvivingCoveredCopy
    ) {
      pruneReasons.set(id, `auto figure filter: ${reasoning}`)
    } else {
      keepReasons.set(
        id,
        `auto guard kept: raster artwork with no selectable-text copy and no surviving standalone duplicate (LLM: ${reasoning})`
      )
    }
  }

  // Deterministic dedup: extraction in auto mode keeps standalone rasters
  // whose artwork also lives inside a composite candidate. When both copies
  // survive the verdicts above, keep the richer composite and prune the
  // standalone so the artwork is not placed twice.
  if (config.figureExtractionMode === "auto") {
    for (const image of input.images) {
      const compositeId = image.containedInFigureId
      if (!compositeId) continue
      if (pruneReasons.has(image.imageId) || pruneReasons.has(compositeId)) continue
      pruneReasons.set(image.imageId, duplicateArtworkReason(compositeId))
    }
  }

  return {
    images: existingClassification.images.map((img) => {
      if (img.isPruned) return img

      const pruneReason = pruneReasons.get(img.imageId)
      if (pruneReason) {
        return { imageId: img.imageId, isPruned: true, reason: pruneReason }
      }

      // Record vetoed prunes on the kept entry so the guard's intervention
      // stays inspectable instead of silently discarding the LLM's verdict.
      const keepReason = keepReasons.get(img.imageId)
      if (keepReason) {
        return { ...img, reason: keepReason }
      }

      return img
    }),
  }
}
