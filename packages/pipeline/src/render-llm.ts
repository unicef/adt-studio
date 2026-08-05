import type { SectionRendering } from "@adt/types"
import { webRenderingLLMSchema, activityAnswersLLMSchema } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import { autoRepairUnderlineActivityHtml } from "./activity-underline-repair.js"
import { validateSectionHtml, isEnumerationMarker } from "./validate-html.js"
import { getViewportBreakpoints, type ScreenshotRenderer } from "./screenshot.js"
import type { RenderConfig, RenderExecutionOptions, RenderNode, RenderSectionInput } from "./web-rendering.js"
import { runVisualReviewLoop } from "./visual-review.js"
import { buildTypographyCss, typographyPreservationErrors } from "./typography.js"
import {
  repairTableOfContentsLayout,
  tableOfContentsLayoutErrors,
} from "./toc-layout.js"
import { DEFAULT_TYPOGRAPHY } from "@adt/types"
import { inspectOrderingActivityHtml } from "./ordering-contract.js"

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
 * - Ordering answers are derived deterministically from validated HTML
 * - Other activities use a second LLM call when config.answerPromptName is set
 */
export async function renderSectionLlm(
  input: RenderSectionInput,
  config: RenderConfig,
  llmModel: LLMModel,
  visualRefinement?: VisualRefinementDeps,
  options: RenderExecutionOptions = {},
): Promise<SectionRendering> {
  const isActivity = config.renderType === "activity"
  const taskType = isActivity ? "activity-rendering" : "web-rendering"
  const { section, context: renderContext } = input

  // Page images for content merged in from other pages — the prompt shows
  // them after the hosting page's image so the LLM doesn't force-match all
  // content against a page image that doesn't contain it.
  const sourcePages = (input.sourcePages ?? []).map((sp) => ({
    page_id: sp.pageId,
    image_base64: sp.imageBase64,
  }))

  const promptContext = {
    label: input.label,
    page_image_base64: input.pageImageBase64,
    source_pages: sourcePages,
    section_id: section.sectionId,
    section_type: section.sectionType,
    nodes: renderContext.nodes,
    leaf_texts: renderContext.leaf_texts,
    images: renderContext.image_refs,
    group_ids: renderContext.group_ids,
    styleguide: input.styleguide ?? "",
    book_fonts: input.bookFonts ?? [],
    typography: (input.typography ?? DEFAULT_TYPOGRAPHY).styles,
    viewports: getViewportBreakpoints(),
    _isActivity: isActivity,
    user_instructions: input.userPrompt ?? "",
  }

  const result = await llmModel.generateObject<{
    reasoning: string
    content: string
  }>({
    schema: webRenderingLLMSchema,
    prompt: config.promptName,
    context: promptContext,
    validate: validateWebRendering,
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    signal: options.signal,
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
    for (const img of renderContext.image_refs) {
      if (img.image_base64) {
        imagesForScreenshot.set(img.image_id, { base64: img.image_base64 })
      }
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
        typographyCss: buildTypographyCss(input.typography ?? DEFAULT_TYPOGRAPHY),
      },
      promptName: vr.promptName,
      maxIterations: vr.maxIterations,
      timeoutMs: vr.timeoutMs,
      temperature: vr.temperature,
      pageImageBase64: input.pageImageBase64,
      additionalPageImages: input.sourcePages,
      promptContext: {
        page_image_base64: input.pageImageBase64,
        section_type: section.sectionType,
        current_html: generatedHtml,
        nodes: renderContext.nodes,
        leaf_texts: renderContext.leaf_texts,
        has_merged_content: sourcePages.length > 0,
      },
      originalImageIntroText: "Here is the original page image (this is what the rendered page should resemble):",
      firstIterationScreenshotsText: "\nHere are screenshots of the current rendered HTML at three viewport sizes:\n",
      nextIterationScreenshotsText: "Here are the updated screenshots after your revision:\n",
      trailingContextText: `Section type: ${section.sectionType}`,
      signal: options.signal,
      validateHtml: (candidateHtml) => {
        const check = validateWebRendering(
          { reasoning: "visual-review", content: candidateHtml },
          promptContext
        )
        if (!check.valid) return { valid: false, errors: check.errors }
        const cleaned = check.cleaned as { reasoning: string; content: string } | undefined
        const cleanedHtml = cleaned?.content ?? candidateHtml
        // Deterministic guard: reject any revision that strips the fixed type
        // scale (the reviewer tends to shrink the intentionally-large text by
        // removing adt-* classes). Rejected revisions keep the prior good HTML.
        const typoErrors = typographyPreservationErrors(generatedHtml, cleanedHtml)
        if (typoErrors.length > 0) return { valid: false, errors: typoErrors }
        return { valid: true, errors: [], cleanedHtml }
      },
    })
    generatedHtml = review.html
  }

  // Persist the same deterministic repair that validation sees. Without this,
  // underline-text sections can validate against repaired HTML while the saved
  // web-rendering node still contains the unrepaired LLM output.
  generatedHtml = autoRepairUnderlineActivityHtml(generatedHtml, section.sectionType)
  if (section.sectionType === "table_of_contents") {
    generatedHtml = repairTableOfContentsLayout(generatedHtml, renderContext.leaf_texts)
  }

  // Ordering has one inspectable source of truth in the validated HTML. Derive
  // its rank map deterministically so initial render, rerender, Studio editing,
  // preview, and export cannot disagree because of a second LLM response.
  let activityReasoning: string | undefined
  let activityAnswers: Record<string, string | boolean | number> | undefined

  if (section.sectionType === "activity_ordering") {
    const inspection = inspectOrderingActivityHtml(generatedHtml)
    if (!inspection.contract) {
      throw new Error(
        `Validated activity_ordering HTML has no usable ordering contract: ${inspection.errors.join(" ")}`,
      )
    }
    activityReasoning = "Derived deterministically from the validated correct item order."
    activityAnswers = inspection.contract.answers
  } else if (isActivity && config.answerPromptName) {
    const answersResult = await llmModel.generateObject<{
      reasoning: string
      answers: Array<{ id: string; value: string | boolean | number }>
    }>({
      schema: activityAnswersLLMSchema,
      prompt: config.answerPromptName,
      context: {
        ...promptContext,
        activity_html: generatedHtml,
      },
      maxRetries: config.maxRetries,
      maxTokens: 4096,
      temperature: config.temperature,
      timeoutMs: config.timeoutMs,
      signal: options.signal,
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
    sectionType: section.sectionType,
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
  const leaf_texts = context.leaf_texts as Array<{ text_id: string; text_type: string; text: string }>
  const images = context.images as Array<{ image_id: string }>
  const nodes = context.nodes as RenderNode[]
  const group_ids = context.group_ids as string[]
  const isActivity = context._isActivity as boolean | undefined
  const sectionId = context.section_id as string
  const sectionType = context.section_type as string
  const allowedTextIds = leaf_texts.map((t) => t.text_id)
  const allowedImageIds = images.map((img) => img.image_id)
  const imageUrlPrefix = `/api/books/${label}/images`
  const expectedTexts = new Map(leaf_texts.map((t) => [t.text_id, t.text]))
  const optionalTextIds = collectOptionalTextIds(leaf_texts)
  let candidateHtml = autoRepairUnderlineActivityHtml(r.content, sectionType)
  if (sectionType === "table_of_contents") {
    candidateHtml = repairTableOfContentsLayout(candidateHtml, leaf_texts)
  }
  const minimumEditableElements = minimumLearnerResponseCount(nodes)

  const check = validateSectionHtml(
    candidateHtml,
    allowedTextIds,
    allowedImageIds,
    imageUrlPrefix,
    {
      ...(isActivity && { allowActivityGeneratedIds: true }),
      allowedContainerIds: group_ids,
      expectedTexts,
      expectedSectionType: sectionType,
      expectedSectionId: sectionId,
      optionalTextIds,
      expectedContentIdOrder: collectLeafDataIdOrder(nodes),
      minimumEditableElements,
    }
  )
  if (sectionType === "table_of_contents") {
    check.errors.push(...tableOfContentsLayoutErrors(candidateHtml, leaf_texts))
    check.valid = check.errors.length === 0
  }
  if (check.valid && check.sectionHtml) {
    return {
      valid: true,
      errors: [],
      cleaned: { reasoning: r.reasoning, content: check.sectionHtml },
    }
  }

  return { valid: check.valid, errors: check.errors }
}

/** Require one response per explicit question/blank. If the tree only contains
 * an activity instruction (common on mixed page-mode pages), require at least
 * one control so a static screenshot cannot pass validation. Questions and
 * blank leaves often describe the same response, so use the larger count
 * instead of adding them together. */
export function minimumLearnerResponseCount(nodes: RenderNode[]): number {
  let questions = 0
  let blanks = 0
  let hasInstruction = false
  function walk(node: RenderNode): void {
    if (node.role === "activity_question") questions += 1
    if (node.role === "activity_fill_in_the_blank") blanks += 1
    if (node.role === "activity_instruction") hasInstruction = true
    for (const child of node.children ?? []) walk(child)
  }
  for (const node of nodes) walk(node)
  const explicit = Math.max(questions, blanks)
  return explicit > 0 ? explicit : hasInstruction ? 1 : 0
}

function collectLeafDataIdOrder(nodes: RenderNode[]): string[] {
  const ids: string[] = []
  function walk(node: RenderNode): void {
    if (node.role) {
      ids.push(node.node_id)
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const node of nodes) walk(node)
  return ids
}

// Recognize underscore runs of any length (single-cell crossword blanks emit
// just `"_"`, inline-sentence blanks emit `___`) and dot runs of 3+
// (single dots are normal punctuation).
const TEXTBOOK_BLANK_RE = /_+|\.{3,}/g
const PLACEHOLDER_MARKER_RE = /\[placeholder:[^\]]+\]/g
const OPTIONAL_TEXT_ROLES = new Set([
  "footer",
  "header",
  "page_number",
  "watermark",
])

/** True if the leaf's text is nothing but textbook blank placeholders
 * (`___`, `...`, `[placeholder:...]`) and inert separators (whitespace,
 * `/`, `-`). Such a leaf carries no content the learner needs to see, so
 * the LLM may legitimately replace it with an editable field and drop
 * the source span. */
function isPlaceholderOnlyText(text: string): boolean {
  if (!TEXTBOOK_BLANK_RE.test(text) && !PLACEHOLDER_MARKER_RE.test(text)) {
    return false
  }
  // Reset regex lastIndex (the .test() call above advances stateful global regexes).
  TEXTBOOK_BLANK_RE.lastIndex = 0
  PLACEHOLDER_MARKER_RE.lastIndex = 0
  // Strip `[placeholder:...]` markers first so the dot-run regex doesn't
  // consume their contents and leave a literal `[placeholder:]` behind.
  const stripped = text
    .replace(PLACEHOLDER_MARKER_RE, "")
    .replace(TEXTBOOK_BLANK_RE, "")
    .replace(/[\s/\-]/g, "")
  return stripped.length === 0
}

export function collectOptionalTextIds(
  leafTexts: Array<{ text_id: string; text_type: string; text: string }>
): Set<string> {
  const optional = new Set<string>()
  for (const leaf of leafTexts) {
    if (OPTIONAL_TEXT_ROLES.has(leaf.text_type)) {
      optional.add(leaf.text_id)
      continue
    }
    // Standalone enumeration-marker labels ("1.", "(i)", "(a)"). Matching
    // activities auto-number their items and reliably drop these provided
    // marker labels even when the prompt asks to keep them; treat them as
    // optional so a drop doesn't fail validation and force retries. The LLM is
    // still free to render them (encouraged by the render prompts).
    if (leaf.text_type === "label" && isEnumerationMarker(leaf.text ?? "")) {
      optional.add(leaf.text_id)
      continue
    }
    if (isPlaceholderOnlyText(leaf.text ?? "")) {
      optional.add(leaf.text_id)
    }
  }
  return optional
}
