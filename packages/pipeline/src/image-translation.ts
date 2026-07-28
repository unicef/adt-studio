import { DEFAULT_IMAGE_GENERATION_MODEL_ID, type AppConfig } from "@adt/types"
import { generateImageWithCache, pngDimensions, type LlmLogEntry } from "@adt/llm"
import { normalizeLocale } from "./language-context.js"

export interface ImageTranslationConfig {
  /** OpenAI image model id (e.g. "openai:gpt-image-2"). */
  modelId: string
  /** Liquid-rendered prompt to send with the image. */
  prompt: string
}

export function buildImageTranslationConfig(appConfig: AppConfig): {
  enabled: boolean
  modelId: string
  selectedImageIds: string[]
} {
  const cfg = appConfig.image_translation
  return {
    enabled: cfg?.enabled === true,
    modelId:
      cfg?.image_model ??
      appConfig.default_image_generation_model ??
      DEFAULT_IMAGE_GENERATION_MODEL_ID,
    selectedImageIds: cfg?.selected_image_ids ?? [],
  }
}

export interface TranslateImageOptions {
  apiKey: string
  modelId: string
  prompt: string
  sourceLanguage: string
  targetLanguage: string
  imageBuffer: Buffer
  imageName: string
  cacheDir?: string
  log?: { taskType: string; pageId?: string; promptName: string }
  onLog?: (entry: LlmLogEntry) => void
  signal?: AbortSignal
}

export interface TranslatedImageResult {
  buffer: Buffer
  width: number
  height: number
  cached: boolean
}

/**
 * Regenerate a single image with text translated from sourceLanguage to targetLanguage.
 * The model is sent the original image as a reference and asked to recreate it with
 * the same layout but with any embedded text in the target language.
 */
export async function translateImage(
  options: TranslateImageOptions
): Promise<TranslatedImageResult> {
  const finalPrompt = [
    `Source language: ${normalizeLocale(options.sourceLanguage)}`,
    `Target language: ${normalizeLocale(options.targetLanguage)}`,
    "",
    options.prompt,
  ].join("\n")

  const result = await generateImageWithCache({
    apiKey: options.apiKey,
    modelId: options.modelId,
    prompt: finalPrompt,
    referenceImages: [{ data: options.imageBuffer, name: options.imageName }],
    cacheDir: options.cacheDir,
    log: options.log,
    onLog: options.onLog,
    signal: options.signal,
  })

  const buffer = Buffer.from(result.base64, "base64")
  const dims = pngDimensions(result.base64)
  if (!dims.width || !dims.height) {
    throw new Error(
      "Image translation: could not read PNG dimensions from model output"
    )
  }

  return {
    buffer,
    width: dims.width,
    height: dims.height,
    cached: result.cached,
  }
}
