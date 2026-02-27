import type { SectionRendering } from "@adt/types"
import { webRenderingLLMSchema, activityAnswersLLMSchema, visualReviewLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult, Message, ContentPart } from "@adt/llm"
import { validateSectionHtml } from "./validate-html.js"
import { buildScreenshotHtml } from "./screenshot-html.js"
import { SCREENSHOT_VIEWPORTS, getViewportBreakpoints, type ScreenshotRenderer } from "./screenshot.js"
import type { RenderConfig, RenderSectionInput, TextInput, ImageInput } from "./web-rendering.js"

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

    // Render the prompt template once to get the system message, then build
    // up conversation history across iterations so the LLM sees its previous
    // attempts and can learn from mistakes.
    const initialMessages = await visualRefinement.llmModel.renderPrompt(vr.promptName, {
      page_image_base64: input.pageImageBase64,
      // Placeholders — the first real user message is built below
      desktop_screenshot_base64: "",
      tablet_screenshot_base64: "",
      mobile_screenshot_base64: "",
      section_type: input.sectionType,
      current_html: generatedHtml,
      viewports: getViewportBreakpoints(),
    })
    const systemMsg = initialMessages.find((m) => m.role === "system")
    const systemPrompt = typeof systemMsg?.content === "string" ? systemMsg.content : undefined

    // Accumulated conversation (user/assistant turns only)
    let conversationMessages: Message[] = []

    for (let iteration = 0; iteration < vr.maxIterations; iteration++) {
      const screenshotHtml = await buildScreenshotHtml({
        sectionHtml: generatedHtml,
        label: input.label,
        images: imagesForScreenshot,
        webAssetsDir: visualRefinement.webAssetsDir,
      })

      // Take screenshots at multiple viewport sizes
      const screenshotParts: ContentPart[] = []
      for (const vp of SCREENSHOT_VIEWPORTS) {
        const base64 = await visualRefinement.screenshotRenderer.screenshot(
          screenshotHtml,
          { width: vp.width, height: vp.height }
        )
        visualRefinement.storeScreenshot?.(base64)
        screenshotParts.push(
          { type: "text", text: `${vp.label} screenshot (${vp.width}px wide):` },
          { type: "image", image: base64 },
        )
      }

      // Build the user message for this iteration
      const userParts: ContentPart[] = []

      if (iteration === 0) {
        // First iteration: include the original page image
        userParts.push(
          { type: "text", text: "Here is the original page image (this is what the rendered page should resemble):" },
          { type: "image", image: input.pageImageBase64 },
          { type: "text", text: "\nHere are screenshots of the current rendered HTML at three viewport sizes:\n" },
        )
      } else {
        userParts.push(
          { type: "text", text: "Here are the updated screenshots after your revision:\n" },
        )
      }

      userParts.push(...screenshotParts)

      userParts.push(
        { type: "text", text: `\nSection type: ${input.sectionType}\n\nCurrent HTML:\n\`\`\`html\n${generatedHtml}\n\`\`\`` },
      )

      conversationMessages.push({ role: "user", content: userParts })

      const reviewResult = await visualRefinement.llmModel.generateObject<{
        approved: boolean
        reasoning: string
        content: string
      }>({
        schema: visualReviewLLMSchema,
        system: systemPrompt,
        messages: conversationMessages,
        maxRetries: 2,
        maxTokens: 16384,
        temperature: vr.temperature,
        timeoutMs: vr.timeoutMs,
        log: {
          taskType: "visual-review",
          pageId: input.pageId,
          promptName: vr.promptName,
        },
      })

      // Append assistant response to conversation history
      conversationMessages.push({
        role: "assistant",
        content: JSON.stringify(reviewResult.object, null, 2),
      })

      if (reviewResult.object.approved) break

      if (!reviewResult.object.content) break

      // Validate the revised HTML structurally before accepting it
      const check = validateWebRendering(
        { reasoning: reviewResult.object.reasoning, content: reviewResult.object.content },
        context
      )
      if (check.valid) {
        const cleaned = check.cleaned as { reasoning: string; content: string }
        generatedHtml = cleaned.content
      } else {
        // Feed errors back to the LLM on the next iteration via conversation
        conversationMessages.push({
          role: "user",
          content: "Your revision failed structural validation with these errors:\n" +
            check.errors.map((e) => `- ${e}`).join("\n") +
            "\n\nPlease fix these issues in your next revision.",
        })
      }
    }
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
