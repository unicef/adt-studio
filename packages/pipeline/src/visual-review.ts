import { visualReviewLLMSchema } from "@adt/types"
import type { LLMModel, Message, ContentPart } from "@adt/llm"
import { buildScreenshotHtml } from "./screenshot-html.js"
import { SCREENSHOT_VIEWPORTS, getViewportBreakpoints, type ScreenshotRenderer } from "./screenshot.js"

export const DEFAULT_VISUAL_REVIEW_MODEL_ID = "openai:gpt-5.2"

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
  // Keep the first (original) turn and the most recent two turns.
  const selectedTurns = turns.length <= 3
    ? turns
    : [turns[0], ...turns.slice(-2)]

  const messages: Message[] = []
  for (const turn of selectedTurns) {
    messages.push(turn.user)
    if (turn.assistant) messages.push(turn.assistant)
    if (turn.feedback) messages.push(turn.feedback)
  }
  return messages
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

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const screenshotHtml = await buildScreenshotHtml({
      sectionHtml: html,
      label,
      images,
      webAssetsDir: deps.webAssetsDir,
    })

    const screenshotParts: ContentPart[] = []
    for (const vp of SCREENSHOT_VIEWPORTS) {
      const base64 = await deps.screenshotRenderer.screenshot(
        screenshotHtml,
        { width: vp.width, height: vp.height }
      )
      deps.storeScreenshot?.(base64)
      screenshotParts.push(
        { type: "text", text: `${vp.label} screenshot (${vp.width}px wide):` },
        { type: "image", image: base64 },
      )
    }

    const userParts: ContentPart[] = []
    if (iteration === 0) {
      if (pageImageBase64) {
        userParts.push(
          { type: "text", text: originalImageIntroText },
          { type: "image", image: pageImageBase64 },
        )
      }
      userParts.push({ type: "text", text: firstIterationScreenshotsText })
    } else {
      userParts.push({ type: "text", text: nextIterationScreenshotsText })
    }

    userParts.push(...screenshotParts)
    userParts.push({
      type: "text",
      text: `\n${trailingContextText}\n\nCurrent HTML:\n\`\`\`html\n${html}\n\`\`\``,
    })

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
      html = check.cleanedHtml ?? revised
    } else {
      turns[turns.length - 1].feedback = {
        role: "user",
        content: "Your revision failed structural validation with these errors:\n" +
          check.errors.map((e) => `- ${e}`).join("\n") +
          "\n\nPlease fix these issues in your next revision.",
      }
    }
  }

  return { html, approved }
}
