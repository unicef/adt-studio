import type { SectionRendering } from "@adt/types"
import { webRenderingLLMSchema, activityAnswersLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { validateSectionHtml } from "./validate-html.js"
import type { RenderConfig, RenderSectionInput, TextInput, ImageInput } from "./web-rendering.js"

/**
 * Render a single section as HTML using an LLM.
 * Handles both regular "llm" and "activity" render types.
 *
 * For activity sections (config.renderType === "activity"):
 * - Validation allows activity_gen_* prefixed data-ids
 * - If config.answerPromptName is set, a second LLM call generates correct answers
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

  const isActivity = config.renderType === "activity"
  const taskType = isActivity ? "activity-rendering" : "web-rendering"

  const context = {
    label: input.label,
    page_image_base64: input.pageImageBase64,
    section_id: input.sectionId,
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
    styleguide: input.styleguide ?? "",
    _isActivity: isActivity,
  }

  const result = await llmModel.generateObject<{
    reasoning: string
    content: string
  }>({
    schema: webRenderingLLMSchema,
    prompt: config.promptName,
    context,
    validate: validateWebRendering,
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    log: {
      taskType,
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })

  const generatedHtml = result.object.content

  // Optional: generate activity answers via a second LLM call
  let activityReasoning: string | undefined
  let activityAnswers: Record<string, string | boolean | number> | undefined

  if (isActivity && config.answerPromptName) {
    const answersResult = await llmModel.generateObject<{
      reasoning: string
      answers: Array<{ id: string; value: string | boolean | number }>
    }>({
      schema: activityAnswersLLMSchema,
      prompt: config.answerPromptName,
      context: {
        ...context,
        activity_html: generatedHtml,
      },
      maxRetries: config.maxRetries,
      maxTokens: 4096,
      temperature: config.temperature,
      timeoutMs: config.timeoutMs,
      log: {
        taskType: "activity-answers",
        pageId: input.pageId,
        promptName: config.answerPromptName,
      },
    })
    activityReasoning = answersResult.object.reasoning
    // Convert array of {id, value} to record for storage
    activityAnswers = Object.fromEntries(
      answersResult.object.answers.map((a) => [a.id, a.value])
    )
  }

  return {
    sectionIndex: input.sectionIndex,
    sectionType: input.sectionType,
    reasoning: result.object.reasoning,
    html: generatedHtml,
    ...(activityReasoning !== undefined && { activityReasoning }),
    ...(activityAnswers !== undefined && { activityAnswers }),
  }
}

function validateWebRendering(
  result: unknown,
  context: Record<string, unknown>
): ValidationResult {
  const r = result as { reasoning: string; content: string }
  const label = context.label as string
  const texts = context.texts as Array<{ text_id: string; text: string }>
  const images = context.images as Array<{ image_id: string }>
  const isActivity = context._isActivity as boolean | undefined
  const allowedTextIds = texts.map((t) => t.text_id)
  const allowedImageIds = images.map((img) => img.image_id)
  const imageUrlPrefix = `/api/books/${label}/images`
  const expectedTexts = new Map(texts.map((t) => [t.text_id, t.text]))

  const check = validateSectionHtml(
    r.content,
    allowedTextIds,
    allowedImageIds,
    imageUrlPrefix,
    {
      ...(isActivity && { allowActivityGeneratedIds: true }),
      expectedTexts,
    }
  )
  if (check.valid && check.sectionHtml) {
    return {
      valid: true,
      errors: [],
      cleaned: { reasoning: r.reasoning, content: check.sectionHtml },
    }
  }
  return { valid: check.valid, errors: check.errors }
}
