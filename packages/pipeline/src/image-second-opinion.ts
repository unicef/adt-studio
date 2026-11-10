import type { AppConfig, LeftOutCategory, SecondOpinionConfidence, SecondOpinionResult, SecondOpinionVerdict } from "@adt/types"
import { DEFAULT_LLM_MAX_RETRIES, imageSecondOpinionLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"

export interface SecondOpinionImageInput {
  imageId: string
  imageBase64: string
  width: number
  height: number
  closeUpBase64?: string
  leftOutReason: string
  position?: string
  repeats?: string
}

export interface SecondOpinionPageInput {
  pageId: string
  pageImageBase64: string
  pageText: string
  book: { title?: string; language?: string; summary?: string }
  answerLanguage?: string
  images: SecondOpinionImageInput[]
}

export const SECOND_OPINION_PROMPT_VERSION = 3

export interface SecondOpinionConfig {
  promptName: string
  modelId: string
  maxRetries: number
}

interface LLMAnswer {
  images: Array<{ image_id: string; reasoning: string; category: LeftOutCategory; verdict: SecondOpinionVerdict; confidence: SecondOpinionConfidence }>
}

export function buildSecondOpinionConfig(appConfig: AppConfig): SecondOpinionConfig | null {
  const model = appConfig.image_meaningfulness?.model ?? appConfig.default_model
  if (!model) return null
  return {
    promptName: "image_second_opinion",
    modelId: model,
    maxRetries: appConfig.image_meaningfulness?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
  }
}

export function describePosition(
  bounds: { x: number; y: number; width: number; height: number } | undefined,
  page: { width: number; height: number } | undefined,
): string | undefined {
  if (!bounds || !page || page.width <= 0 || page.height <= 0) return undefined
  const pct = (value: number, total: number) => Math.round((value / total) * 100)
  const centerX = (bounds.x + bounds.width / 2) / page.width
  const centerY = (bounds.y + bounds.height / 2) / page.height
  const vertical = centerY < 0.33 ? "top" : centerY > 0.66 ? "bottom" : "middle"
  const horizontal = centerX < 0.33 ? "left" : centerX > 0.66 ? "right" : "centre"
  return `${vertical} ${horizontal}, about ${pct(bounds.width, page.width)}% of the page width and ${pct(bounds.height, page.height)}% of its height`
}

const ANSWER_LANGUAGES: Record<string, string> = {
  en: "English",
  "pt-br": "Brazilian Portuguese",
  pt: "Portuguese",
  es: "Spanish",
  fr: "French",
  sq: "Albanian",
}

export function answerLanguageName(locale: string | undefined): string {
  if (!locale) return "English"
  const key = locale.toLowerCase()
  return ANSWER_LANGUAGES[key] ?? ANSWER_LANGUAGES[key.split("-")[0]] ?? "English"
}

/** Plain-language removal rule for the prompt, without an earlier AI's reasoning so the model judges afresh. */
export function describeLeftOutRule(reason: string | undefined): string {
  const raw = (reason ?? "").trim()
  if (!raw) return "unknown"
  if (/^shortest side/i.test(raw)) return `size rule (${raw})`
  if (/^longest side/i.test(raw)) return `size rule (${raw})`
  if (/^stddev/i.test(raw)) return "blankness rule: the picture is almost one flat colour"
  if (/^not meaningful/i.test(raw)) return "an earlier automatic check judged it not meaningful"
  if (/^auto figure filter/i.test(raw)) return "an earlier automatic check judged it better rebuilt as HTML"
  if (/^duplicate artwork/i.test(raw)) return "it duplicates artwork that is kept elsewhere on the page"
  if (/^full-page render/i.test(raw)) return "it is a render of the whole page"
  return raw.split(":")[0]
}

export function describeRepeats(repeats: { count: number; pages: number } | undefined): string | undefined {
  if (!repeats || repeats.count <= 1) return undefined
  return `the same picture appears ${repeats.count} times on ${repeats.pages} pages`
}

/** Ask the model to re-judge images the filters left out. Pure: no storage access. */
export async function secondOpinionForPage(
  input: SecondOpinionPageInput,
  config: SecondOpinionConfig,
  llmModel: LLMModel,
): Promise<SecondOpinionResult[]> {
  if (input.images.length === 0) return []
  const inputIds = input.images.map((image) => image.imageId)
  const result = await llmModel.generateObject<LLMAnswer>({
    schema: imageSecondOpinionLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      page_text: input.pageText,
      book_title: input.book.title,
      book_language: input.book.language,
      book_summary: input.book.summary,
      answer_language: input.answerLanguage ?? "English",
      images: input.images,
    },
    validate: (raw: unknown): ValidationResult => {
      const returned = (raw as LLMAnswer).images.map((image) => image.image_id)
      const missing = inputIds.filter((id) => !returned.includes(id))
      const extra = returned.filter((id) => !inputIds.includes(id))
      const errors: string[] = []
      if (missing.length > 0) errors.push(`Missing results for image IDs: ${missing.join(", ")}. You must evaluate every image.`)
      if (extra.length > 0) errors.push(`Unexpected image IDs: ${extra.join(", ")}. Only evaluate the images provided.`)
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
    maxTokens: 4096,
    log: { taskType: "image-second-opinion", pageId: input.pageId, promptName: config.promptName },
  })
  const byId = new Map(result.object.images.map((image) => [image.image_id, image]))
  return inputIds.flatMap((imageId) => {
    const answer = byId.get(imageId)
    if (!answer) return []
    const verdict: SecondOpinionVerdict = answer.confidence === "low" ? "unsure" : answer.verdict
    return [{ imageId, verdict, category: answer.category, reasoning: answer.reasoning, confidence: answer.confidence }]
  })
}
