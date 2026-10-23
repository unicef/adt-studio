import { DEFAULT_IMAGE_GENERATION_MODEL_ID, type AppConfig } from "@adt/types"
import { generateImageWithCache, type LlmLogEntry } from "@adt/llm"
import { normalizeLocale } from "./language-context.js"

export interface ImageTranslationConfig {
  /** Provider-qualified image model id (e.g. "google:gemini-3.1-flash-image"). */
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
  /** MIME type of the regenerated image (e.g. "image/jpeg"). */
  mimeType: string
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

  return {
    buffer,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    cached: result.cached,
  }
}
