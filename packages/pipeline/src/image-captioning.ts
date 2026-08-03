import { parseDocument, DomUtils } from "htmlparser2"
import type { AppConfig, GlossaryOutput, ImageCaptioningOutput } from "@adt/types"
import {
  imageCaptioningLLMSchema,
  imageCaptioningLocalLLMSchema,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { buildLanguageContext } from "./language-context.js"

export interface CaptionPageInput {
  pageId: string
  pageImageBase64: string
  /** Extracted page text used only to ground names and story actions. */
  pageText?: string
  images: { imageId: string; imageBase64: string; width?: number; height?: number }[]
  language: string
  bookSummary?: string
}

export interface CaptionConfig {
  promptName: string
  modelId: string
  maxRetries: number
  userPrompt?: string
  gradeLevel?: "early" | "middle" | "advanced"
}

const NARRATIVE_ACTION = /\b(?:approach(?:es|ed|ing)?|climb(?:s|ed|ing)?|come|comes|came|creep(?:s|ing)?|crept|fall(?:s|ing)?|fell|go|goes|going|went|hang(?:s|ing)?|hung|jump(?:s|ed|ing)?|land(?:s|ed|ing)?|look(?:s|ed|ing)?|point(?:s|ed|ing)?|run(?:s|ning)?|ran|shake(?:s|n)?|shook|shout(?:s|ed|ing)?|sleep(?:s|ing)?|slept|throw(?:s|ing)?|threw|wake(?:s|d|n|ing)?|woke|watch(?:es|ed|ing)?)\b/i

const ACTION_CUES: Array<{ label: string; source: RegExp; output: RegExp }> = [
  { label: "sleep", source: /\b(?:sleep|sleeps|sleeping|slept)\b/i, output: /\b(?:sleep|sleeps|sleeping|slept|asleep)\b/i },
  { label: "wake", source: /\b(?:wake|wakes|waking|woke|woken)\b/i, output: /\b(?:wake|wakes|waking|woke|woken|awake)\b/i },
  { label: "shout", source: /\b(?:shout|shouts|shouted|shouting)\b/i, output: /\b(?:shout|shouts|shouted|shouting|call|calls|called|yell|yells|yelled)\b/i },
  { label: "point", source: /\b(?:point|points|pointed|pointing)\b/i, output: /\b(?:point|points|pointed|pointing)\b/i },
  { label: "throw", source: /\b(?:throw|throws|throwing|threw)\b/i, output: /\b(?:throw|throws|throwing|threw|toss|tosses|tossed)\b/i },
  { label: "run away", source: /\b(?:run|runs|running|ran)\b/i, output: /\b(?:run|runs|running|ran|flee|flees|fled|escape|escapes|escaped)\b/i },
  { label: "jump", source: /\b(?:jump|jumps|jumped|jumping)\b/i, output: /\b(?:jump|jumps|jumped|jumping|leap|leaps|leapt)\b/i },
  { label: "climb", source: /\b(?:climb|climbs|climbed|climbing)\b/i, output: /\b(?:climb|climbs|climbed|climbing)\b/i },
  { label: "approach", source: /\b(?:approach(?:es|ed|ing)?|come|comes|came|creep(?:s|ing)?|crept)\b/i, output: /\b(?:approach(?:es|ed|ing)?|come|comes|came|creep(?:s|ing)?|crept|near|toward|towards)\b/i },
  { label: "shake", source: /\b(?:shake|shakes|shaking|shook|shaken)\b/i, output: /\b(?:shake|shakes|shaking|shook|shaken|sway|sways|swaying)\b/i },
  { label: "fall or move downward", source: /(?:\b(?:fall|falls|falling|fell)\b|\bdown\s+(?:went|goes)\b|\b(?:went|goes)\s+down\b)/i, output: /\b(?:fall|falls|falling|fell|drop|drops|dropped|down|hang|hangs|hanging|hung)\b/i },
  { label: "hang", source: /\b(?:hang|hangs|hanging|hung)\b/i, output: /\b(?:hang|hangs|hanging|hung|dangle|dangles|dangling)\b/i },
  { label: "land on", source: /\b(?:land|lands|landed|landing)\b/i, output: /\b(?:land|lands|landed|landing|fall|falls|fell|onto|on top)\b/i },
  { label: "look or watch", source: /\b(?:look(?:s|ed|ing)?|watch(?:es|ed|ing)?)\b/i, output: /\b(?:look(?:s|ed|ing)?|watch(?:es|ed|ing)?|see|sees|saw|stare|stares)\b/i },
  { label: "go or return home", source: /\b(?:(?:go|goes|going|went)\s+(?:back\s+)?home|return(?:s|ed|ing)?\s+home)\b/i, output: /\b(?:go|goes|going|went|walk|walks|walking|return|returns|returned|home)\b/i },
]

/** Compact story clauses help small local vision models retain multi-action scenes. */
export function extractNarrativeActionClauses(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\s+(?:and then|then)\s+|\s*;\s*/i)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 2 && NARRATIVE_ACTION.test(clause))
    .slice(0, 6)
}

export function missingNarrativeActionCues(text: string, output: string): string[] {
  return ACTION_CUES
    .filter((cue) => cue.source.test(text) && !cue.output.test(output))
    .map((cue) => cue.label)
}

function removeUngroundedSnow(text: string): string {
  return text
    .replace(/\bsnow-covered\s*/gi, "")
    .replace(/\bsnowy\s+/gi, "")
    .replace(/\bthrough (?:the\s+)?snow\b/gi, "across the ground")
    .replace(/\bin (?:the\s+)?snow\b/gi, "on the ground")
    .replace(/\b(?:the\s+)?snow\b/gi, "the ground")
    .replace(/\s{2,}/g, " ")
    .trim()
}

/**
 * Extract unique image IDs from rendered HTML sections.
 * Parses each section's HTML and finds <img> tags with data-id attributes.
 */
export function extractImageIds(htmlSections: string[]): string[] {
  const ids = new Set<string>()
  for (const html of htmlSections) {
    const doc = parseDocument(html)
    const imgElements = DomUtils.findAll(
      (el) =>
        el.type === "tag" &&
        el.name === "img" &&
        !!el.attribs?.["data-id"],
      doc.children
    )
    for (const el of imgElements) {
      ids.add(el.attribs["data-id"])
    }
  }
  return [...ids]
}

/**
 * Collect the images that should be captioned for a page. Glossary images may
 * not appear in rendered page HTML, so callers can include their IDs here.
 */
export function collectCaptionImageIds(
  htmlSections: string[],
  additionalImageIds: readonly string[] = []
): string[] {
  const ids = new Set(extractImageIds(htmlSections))
  for (const imageId of additionalImageIds) {
    ids.add(imageId)
  }
  return [...ids]
}

/**
 * Group active glossary image assignments by the page that owns each image.
 * The page lookup is supplied by the caller so this stays independent of storage.
 */
export function groupGlossaryImageIdsByPage(
  glossary: GlossaryOutput | undefined,
  getImagePageId: (imageId: string) => string | undefined
): Map<string, string[]> {
  const imageIdsByPage = new Map<string, string[]>()
  const seenImageIds = new Set<string>()
  for (const item of glossary?.items ?? []) {
    if (item.pruned || !item.imageId || seenImageIds.has(item.imageId)) continue
    seenImageIds.add(item.imageId)
    const pageId = getImagePageId(item.imageId)
    if (!pageId) continue
    const imageIds = imageIdsByPage.get(pageId) ?? []
    imageIds.push(item.imageId)
    imageIdsByPage.set(pageId, imageIds)
  }
  return imageIdsByPage
}

/**
 * Build captioning config from AppConfig with sensible defaults.
 */
export function buildCaptionConfig(appConfig: AppConfig): CaptionConfig {
  return {
    promptName: appConfig.image_captioning?.prompt ?? "image_captioning",
    modelId:
      appConfig.image_captioning?.model ??
      appConfig.page_sectioning?.model ??
      appConfig.default_model ??
      "openai:gpt-4.1",
    maxRetries:
      appConfig.image_captioning?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    userPrompt: appConfig.image_captioning_user_prompt || undefined,
    gradeLevel: appConfig.image_captioning_grade_level,
  }
}

/**
 * Caption all images on a page in a single LLM call.
 * Pure function — no side effects.
 */
export async function captionPageImages(
  input: CaptionPageInput,
  config: CaptionConfig,
  llmModel: LLMModel
): Promise<ImageCaptioningOutput> {
  if (input.images.length === 0) {
    return { captions: [] }
  }

  const inputImageIds = input.images.map((img) => img.imageId)
  const inputImagesById = new Map(input.images.map((img) => [img.imageId, img]))
  const languageContext = buildLanguageContext(input.language)
  const pageText = input.pageText?.trim().slice(0, 12_000)
  const narrativeActions = pageText ? extractNarrativeActionClauses(pageText) : []

  const result = await llmModel.generateObject<{
    captions: Array<{ image_id: string; reasoning: string; caption: string; decorative?: boolean }>
  }>({
    schema: config.modelId.startsWith("local:")
      ? imageCaptioningLocalLLMSchema
      : imageCaptioningLLMSchema,
    prompt: config.promptName,
    context: {
      page_image_base64: input.pageImageBase64,
      images: input.images,
      ...languageContext,
      ...(pageText ? { page_text: pageText } : {}),
      ...(narrativeActions.length > 0 ? { narrative_actions: narrativeActions } : {}),
      ...(input.bookSummary ? { book_summary: input.bookSummary } : {}),
      user_instructions: config.userPrompt ?? "",
      grade_level: config.gradeLevel ?? "",
    },
    validate: (
      raw: unknown
    ): ValidationResult => {
      const r = raw as {
        captions: Array<{ image_id: string; reasoning: string; caption: string; decorative?: boolean }>
      }
      const returnedIds = r.captions.map((c) => c.image_id)
      const missing = inputImageIds.filter((id) => !returnedIds.includes(id))
      const extra = returnedIds.filter((id) => !inputImageIds.includes(id))
      const duplicateIds = [...new Set(
        returnedIds.filter((id, index) => returnedIds.indexOf(id) !== index)
      )]
      const errors: string[] = []
      if (missing.length > 0) {
        errors.push(
          `Missing captions for image IDs: ${missing.join(", ")}. You must provide a caption for every image.`
        )
      }
      if (extra.length > 0) {
        errors.push(
          `Unexpected image IDs: ${extra.join(", ")}. Only caption the images provided.`
        )
      }
      if (duplicateIds.length > 0) {
        errors.push(
          `Duplicate image IDs: ${duplicateIds.join(", ")}. Provide exactly one caption per image.`
        )
      }
      for (const caption of r.captions) {
        const image = inputImagesById.get(caption.image_id)
        const isLargeSelectedImage =
          image?.width !== undefined &&
          image?.height !== undefined &&
          image.width >= 256 &&
          image.height >= 256
        if (!caption.decorative && !caption.caption.trim()) {
          errors.push(
            `Image ${caption.image_id} is not decorative and requires a non-empty caption.`
          )
        }
        // Large images selected into the educational page layout are content
        // by default. This conservative backstop prevents local vision models
        // from hiding a full-page illustration after a weak visual read.
        if (
          caption.decorative &&
          isLargeSelectedImage
        ) {
          errors.push(
            `Image ${caption.image_id} is ${image.width}x${image.height} and must be treated as meaningful content with a caption.`
          )
        }
        if (
          isLargeSelectedImage
          && /distort|pixelat|corrupt|technical error|not recogniz|no discernible|no visual information/i.test(
            `${caption.reasoning} ${caption.caption}`,
          )
        ) {
          errors.push(
            `Image ${caption.image_id} appears unreadable to the model. Reinspect the supplied image before captioning it.`,
          )
        }
      }
      return { valid: errors.length === 0, errors }
    },
    maxRetries: config.maxRetries,
    maxTokens: Math.min(4096, 384 + input.images.length * 384),
    temperature: config.modelId.startsWith("local:") ? 0.4 : undefined,
    log: {
      taskType: "image-captioning",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  const stripSnow = config.modelId.startsWith("local:")
    && pageText !== undefined
    && !/\b(?:snow|snowy|winter|ice|icy)\b/i.test(pageText)

  return {
    captions: result.object.captions.map((c) => ({
      imageId: c.image_id,
      reasoning: stripSnow ? removeUngroundedSnow(c.reasoning) : c.reasoning,
      // Decorative images need no caption — drop any text the model emitted.
      caption: c.decorative ? "" : stripSnow ? removeUngroundedSnow(c.caption) : c.caption,
      ...(c.decorative ? { decorative: true } : {}),
    })),
  }
}
