import type { SectionRendering } from "@adt/types"
import { webRenderingLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { validateSectionHtml } from "./validate-html.js"
import type { RenderConfig, RenderSectionInput, TextInput, ImageInput } from "./web-rendering.js"

/**
 * Render a single section as HTML using an LLM.
 * Flattens `parts` to texts/images arrays for the LLM context.
 */
export async function renderSectionLlm(
  input: RenderSectionInput,
  config: RenderConfig,
  llmModel: LLMModel
): Promise<SectionRendering> {
  const texts: TextInput[] = []
  const images: ImageInput[] = []

  for (const part of input.parts) {
    if (part.type === "group") {
      texts.push(...part.texts)
    } else {
      images.push({ imageId: part.imageId, imageBase64: part.imageBase64 })
    }
  }

  const result = await llmModel.generateObject<{
    reasoning: string
    content: string
  }>({
    schema: webRenderingLLMSchema,
    prompt: config.promptName,
    context: {
      label: input.label,
      page_image_base64: input.pageImageBase64,
      section_type: input.sectionType,
      texts: texts.map((t) => ({
        text_id: t.textId,
        text_type: t.textType,
        text: t.text,
      })),
      images: images.map((img) => ({
        image_id: img.imageId,
        image_base64: img.imageBase64,
      })),
    },
    validate: validateWebRendering,
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    timeoutMs: config.timeoutMs,
    log: {
      taskType: "web-rendering",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  return {
    sectionIndex: input.sectionIndex,
    sectionType: input.sectionType,
    reasoning: result.object.reasoning,
    html: result.object.content,
  }
}

function validateWebRendering(
  result: unknown,
  context: Record<string, unknown>
): ValidationResult {
  const r = result as { reasoning: string; content: string }
  const label = context.label as string
  const texts = context.texts as Array<{ text_id: string }>
  const images = context.images as Array<{ image_id: string }>
  const allowedTextIds = texts.map((t) => t.text_id)
  const allowedImageIds = images.map((img) => img.image_id)
  const imageUrlPrefix = `/api/books/${label}/images`

  const check = validateSectionHtml(r.content, allowedTextIds, allowedImageIds, imageUrlPrefix)
  if (check.valid && check.sectionHtml) {
    return {
      valid: true,
      errors: [],
      cleaned: { reasoning: r.reasoning, content: check.sectionHtml },
    }
  }
  return { valid: check.valid, errors: check.errors }
}
