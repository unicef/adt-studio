import { visualReviewLLMSchema } from "@adt/types"
import type { LLMModel, Message, ContentPart } from "@adt/llm"
import { buildScreenshotHtml } from "./screenshot-html.js"
import { SCREENSHOT_VIEWPORTS, getViewportBreakpoints, type ScreenshotRenderer } from "./screenshot.js"

export const DEFAULT_VISUAL_REVIEW_MODEL_ID = "openai:gpt-5.4"

export interface VisualReviewDeps {
  llmModel: LLMModel
  screenshotRenderer: ScreenshotRenderer
  webAssetsDir: string
  storeScreenshot?: (base64: string) => void
}

export interface VisualReviewValidation {
  valid: boolean
  errors: string[]
  cleanedHtml?: string
}

export interface RunVisualReviewLoopOptions {
  initialHtml: string
  label: string
  pageId: string
  images: Map<string, { base64: string }>
  deps: VisualReviewDeps
  promptName: string
  maxIterations: number
  timeoutMs: number
  temperature?: number
  pageImageBase64?: string
  /**
   * Page images for content merged into the section from other pages —
   * shown after the primary page image so the reviewer doesn't flag merged
   * content as missing from the original.
   */
  additionalPageImages?: Array<{ pageId: string; imageBase64: string }>
  promptContext?: Record<string, unknown>
  originalImageIntroText?: string
  firstIterationScreenshotsText: string
  nextIterationScreenshotsText: string
  trailingContextText: string
  validateHtml: (html: string) => VisualReviewValidation
}

export interface VisualReviewResult {
  html: string
  approved: boolean
}

interface ConversationTurn {
  user: Message
  assistant?: Message
  feedback?: Message
}

function stripMarkdownFence(content: string): string {
  return content
    .replace(/^```(?:html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
}

function buildConversationWindow(turns: ConversationTurn[]): Message[] {
  // Keep only the most recent turn (carries the latest screenshots and HTML).
  // Earlier turns add tokens (especially base64 screenshots) without helping the
  // model evaluate the current state — the system prompt + the current screenshots
  // are sufficient.
  const selectedTurns = turns.slice(-1)

  const messages: Message[] = []
  for (const turn of selectedTurns) {
    messages.push(turn.user)
    if (turn.assistant) messages.push(turn.assistant)
    if (turn.feedback) messages.push(turn.feedback)
  }
  return messages
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

export async function runVisualReviewLoop(
  options: RunVisualReviewLoopOptions
): Promise<VisualReviewResult> {
  const {
    initialHtml,
    label,
    pageId,
    images,
    deps,
    promptName,
    maxIterations,
    timeoutMs,
    temperature,
    pageImageBase64,
    additionalPageImages,
    promptContext,
    originalImageIntroText = "Here is the original page image for reference:",
    firstIterationScreenshotsText,
    nextIterationScreenshotsText,
    trailingContextText,
    validateHtml,
  } = options

  const initialMessages = await deps.llmModel.renderPrompt(promptName, {
    ...(promptContext ?? {}),
    viewports: getViewportBreakpoints(),
  })
  const systemMsg = initialMessages.find((m) => m.role === "system")
  const systemPrompt = typeof systemMsg?.content === "string" ? systemMsg.content : undefined

  let html = initialHtml
  const turns: ConversationTurn[] = []
  let approved = false
  const seenRevisions = new Set<string>([normalizeForCompare(initialHtml)])
  // Validation feedback carried forward when the previous revision failed
  // structural checks. Surfaced into the next user message so the model can fix
  // it. Cleared after each emit.
  let pendingValidationFeedback: string | null = null

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const screenshotHtml = await buildScreenshotHtml({
      sectionHtml: html,
      label,
      images,
      webAssetsDir: deps.webAssetsDir,
    })

    // Render all viewport screenshots in parallel — they're independent and
    // each takes ~1-2s, so serialising them was a 3-6s tax per iteration.
    const screenshots = await Promise.all(
      SCREENSHOT_VIEWPORTS.map((vp) =>
        deps.screenshotRenderer.screenshot(
          screenshotHtml,
          { width: vp.width, height: vp.height }
        )
      )
    )
    const screenshotParts: ContentPart[] = []
    for (let i = 0; i < SCREENSHOT_VIEWPORTS.length; i++) {
      const vp = SCREENSHOT_VIEWPORTS[i]
      const base64 = screenshots[i]
      deps.storeScreenshot?.(base64)
      screenshotParts.push(
        { type: "text", text: `${vp.label} screenshot (${vp.width}px wide):` },
        { type: "image", image: base64 },
      )
    }

    // Each iteration's user message is self-contained: original page image (if any)
    // + current screenshots + current HTML. The conversation window keeps only the
    // most recent turn, so prior screenshots aren't carried forward.
    const userParts: ContentPart[] = []
    if (pageImageBase64) {
      userParts.push(
        { type: "text", text: originalImageIntroText },
        { type: "image", image: pageImageBase64 },
      )
    }
    for (const sp of additionalPageImages ?? []) {
      userParts.push(
        {
          type: "text",
          text: `This section also includes content merged from another page (${sp.pageId}). That content does NOT appear in the page image above — use this additional page image as its visual reference:`,
        },
        { type: "image", image: sp.imageBase64 },
      )
    }
    userParts.push({
      type: "text",
      text: iteration === 0 ? firstIterationScreenshotsText : nextIterationScreenshotsText,
    })

    userParts.push(...screenshotParts)
    userParts.push({
      type: "text",
      text: `\n${trailingContextText}\n\nCurrent HTML:\n\`\`\`html\n${html}\n\`\`\``,
    })
    if (pendingValidationFeedback) {
      userParts.push({ type: "text", text: pendingValidationFeedback })
      pendingValidationFeedback = null
    }

    const userMessage: Message = { role: "user", content: userParts }
    turns.push({ user: userMessage })

    const reviewResult = await deps.llmModel.generateObject<{
      approved: boolean
      reasoning: string
      content: string
    }>({
      schema: visualReviewLLMSchema,
      system: systemPrompt,
      messages: buildConversationWindow(turns),
      maxRetries: 2,
      maxTokens: 16384,
      temperature,
      timeoutMs,
      log: {
        taskType: "visual-review",
        pageId,
        promptName,
      },
    })

    const assistantMessage: Message = {
      role: "assistant",
      content: JSON.stringify(reviewResult.object, null, 2),
    }
    turns[turns.length - 1].assistant = assistantMessage

    if (reviewResult.object.approved) {
      approved = true
      break
    }
    if (!reviewResult.object.content) break

    const revised = stripMarkdownFence(reviewResult.object.content)
    const check = validateHtml(revised)

    if (check.valid) {
      const cleaned = check.cleanedHtml ?? revised
      const fingerprint = normalizeForCompare(cleaned)
      // Stop if the model produced a revision we've already seen (no progress).
      if (seenRevisions.has(fingerprint)) break
      seenRevisions.add(fingerprint)
      html = cleaned
    } else {
      pendingValidationFeedback =
        "Your previous revision failed structural validation with these errors:\n" +
        check.errors.map((e) => `- ${e}`).join("\n") +
        "\n\nThe revision you produced was:\n```html\n" + revised + "\n```\n\n" +
        "Please fix these issues in your next revision."
    }
  }

  return { html, approved }
}
