import type { SectionRendering } from "@adt/types"
import { webRenderingLLMSchema, activityAnswersLLMSchema, activityTypeCheckLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { validateSectionHtml } from "./validate-html.js"
import { getViewportBreakpoints, type ScreenshotRenderer } from "./screenshot.js"
import type { RenderConfig, RenderSectionInput, TextInput, ImageInput, ActivityTypeDef } from "./web-rendering.js"
import { runVisualReviewLoop } from "./visual-review.js"

/** Dependencies for the optional visual refinement loop. */
export interface VisualRefinementDeps {
  screenshotRenderer: ScreenshotRenderer
  webAssetsDir: string
  /** Resolve an LLM model for visual review (may differ from the generation model). */
  llmModel: LLMModel
  /** Persist a screenshot (base64 PNG) so it can be resolved in the LLM log UI. */
  storeScreenshot?: (base64: string) => void
}

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
  llmModel: LLMModel,
  visualRefinement?: VisualRefinementDeps,
): Promise<SectionRendering> {
  const texts: TextInput[] = []
  const images: ImageInput[] = []

  for (const part of input.parts) {
    if (part.type === "group") {
      texts.push(...part.texts)
    } else {
      images.push({ imageId: part.imageId, imageBase64: part.imageBase64, width: part.width, height: part.height })
    }
  }

  const isActivity = config.renderType === "activity"
  const taskType = isActivity ? "activity-rendering" : "web-rendering"

  // Build structured groups (preserves groupId/groupType for prompts that need it)
  const groups: Array<{
    group_id: string
    group_type: string
    texts: Array<{ text_id: string; text_type: string; text: string }>
  }> = []
  for (const part of input.parts) {
    if (part.type === "group") {
      groups.push({
        group_id: part.groupId,
        group_type: part.groupType,
        texts: part.texts.map((t) => ({
          text_id: t.textId,
          text_type: t.textType,
          text: t.text,
        })),
      })
    }
  }

  // Build ordered parts list preserving document flow (text groups + images interleaved).
  // This helps overlay prompts understand spatial relationships between content.
  const orderedParts: Array<
    | { part_type: "text_group"; group_id: string; group_type: string; texts: Array<{ text_id: string; text_type: string; text: string }> }
    | { part_type: "image"; image_id: string }
  > = []
  for (const part of input.parts) {
    if (part.type === "group") {
      orderedParts.push({
        part_type: "text_group",
        group_id: part.groupId,
        group_type: part.groupType,
        texts: part.texts.map((t) => ({
          text_id: t.textId,
          text_type: t.textType,
          text: t.text,
        })),
      })
    } else {
      orderedParts.push({
        part_type: "image",
        image_id: part.imageId,
      })
    }
  }

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
    groups,
    ordered_parts: orderedParts,
    images: images.map((img) => ({
      image_id: img.imageId,
      image_base64: img.imageBase64,
      ...(img.width != null && { width: img.width }),
      ...(img.height != null && { height: img.height }),
    })),
    styleguide: input.styleguide ?? "",
    viewports: getViewportBreakpoints(),
    _isActivity: isActivity,
    user_instructions: input.userPrompt ?? "",
    reference_html: input.referenceHtml ?? "",
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

  let generatedHtml = result.object.content

  // Optional: visual refinement loop — screenshot the HTML and ask an LLM to review
  if (visualRefinement && config.visualRefinement?.enabled) {
    const vr = config.visualRefinement
    const imagesForScreenshot = new Map<string, { base64: string }>()
    for (const img of images) {
      imagesForScreenshot.set(img.imageId, { base64: img.imageBase64 })
    }

    const review = await runVisualReviewLoop({
      initialHtml: generatedHtml,
      label: input.label,
      pageId: input.pageId,
      images: imagesForScreenshot,
      deps: {
        llmModel: visualRefinement.llmModel,
        screenshotRenderer: visualRefinement.screenshotRenderer,
        webAssetsDir: visualRefinement.webAssetsDir,
        storeScreenshot: visualRefinement.storeScreenshot,
      },
      promptName: vr.promptName,
      maxIterations: vr.maxIterations,
      timeoutMs: vr.timeoutMs,
      temperature: vr.temperature,
      pageImageBase64: input.pageImageBase64,
      promptContext: {
        page_image_base64: input.pageImageBase64,
        section_type: input.sectionType,
        current_html: generatedHtml,
      },
      originalImageIntroText: "Here is the original page image (this is what the rendered page should resemble):",
      firstIterationScreenshotsText: "\nHere are screenshots of the current rendered HTML at three viewport sizes:\n",
      nextIterationScreenshotsText: "Here are the updated screenshots after your revision:\n",
      trailingContextText: `Section type: ${input.sectionType}`,
      validateHtml: (candidateHtml) => {
        const check = validateWebRendering(
          { reasoning: "visual-review", content: candidateHtml },
          context
        )
        if (!check.valid) return { valid: false, errors: check.errors }
        const cleaned = check.cleaned as { reasoning: string; content: string } | undefined
        return { valid: true, errors: [], cleanedHtml: cleaned?.content }
      },
    })
    generatedHtml = review.html
  }

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

/**
 * Lightweight pre-render check that validates an activity section's assigned type.
 * Returns the corrected type if it differs from the assigned type, or undefined if correct.
 */
export async function checkActivityType(
  input: RenderSectionInput,
  availableTypes: ActivityTypeDef[],
  llmModel: LLMModel,
): Promise<string | undefined> {
  const texts: Array<{ text_id: string; text_type: string; text: string }> = []
  for (const part of input.parts) {
    if (part.type === "group") {
      for (const t of part.texts) {
        texts.push({ text_id: t.textId, text_type: t.textType, text: t.text })
      }
    }
  }

  const validKeys = new Set(availableTypes.map((t) => t.key))

  const result = await llmModel.generateObject<{
    reasoning: string
    correct_type: string
  }>({
    schema: activityTypeCheckLLMSchema,
    prompt: "activity_type_check",
    context: {
      assigned_type: input.sectionType,
      texts,
      available_types: availableTypes,
    },
    validate: (obj) => {
      const r = obj as { correct_type: string }
      if (!validKeys.has(r.correct_type)) {
        return {
          valid: false,
          errors: [
            `Invalid correct_type "${r.correct_type}". Must be one of: ${[...validKeys].join(", ")}`,
          ],
        }
      }
      return { valid: true, errors: [] }
    },
    maxRetries: 2,
    maxTokens: 1024,
    temperature: 0,
    timeoutMs: 30_000,
    log: {
      taskType: "activity-type-check",
      pageId: input.pageId,
      promptName: "activity_type_check",
    },
  })

  const corrected = result.object.correct_type
  if (corrected !== input.sectionType) {
    console.log(
      `[type-check] ${input.pageId}/${input.sectionId}: corrected ${input.sectionType} → ${corrected} (${result.object.reasoning})`
    )
    return corrected
  }
  return undefined
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
  const sectionId = context.section_id as string
  const sectionType = context.section_type as string
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
      expectedSectionType: sectionType,
      expectedSectionId: sectionId,
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
