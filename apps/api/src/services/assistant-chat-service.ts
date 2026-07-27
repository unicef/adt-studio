import crypto from "node:crypto"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import { loadBookConfig } from "@adt/pipeline"
import { WebRenderingOutput, assistantChatLLMSchema, type AssistantChatMessage } from "@adt/types"

export interface AssistantChatOptions {
  label: string
  message: string
  history: AssistantChatMessage[]
  pageId?: string
  sectionIndex?: number
  correlationId?: string
  booksDir: string
  promptsDir: string
  configPath?: string
  docsBaseUrl?: string
  apiKey: string
}

export interface AssistantChatResult {
  reply: string
  correlationId: string
}

/**
 * Guidance-only chat: grounds replies in the current page/section context but
 * never mutates book data — it only advises which existing actions to use.
 */
export async function assistantChat(
  options: AssistantChatOptions
): Promise<AssistantChatResult> {
  const { label, message, history, pageId, sectionIndex, booksDir, promptsDir, configPath, docsBaseUrl, apiKey } = options

  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = apiKey

  const storage = createBookStorage(label, booksDir)

  try {
    const config = loadBookConfig(label, booksDir, configPath)
    const modelId = (config as Record<string, unknown>).page_sectioning
      ? ((config as Record<string, unknown>).page_sectioning as Record<string, unknown>).model as string
      : "openai:gpt-4o"

    const cacheDir = path.join(path.resolve(booksDir), label, ".cache")
    const bookPromptsDir = path.join(path.resolve(booksDir), label, "prompts")
    const promptEngine = createPromptEngine([bookPromptsDir, promptsDir])
    const model = createLLMModel({
      modelId,
      cacheDir,
      promptEngine,
      onLog: (entry) => storage.appendLlmLog(entry),
    })

    // The widget lives at the app root, outside any specific section's
    // selection state, so we ground it in the whole page's sections rather
    // than requiring the frontend to track "which section is open." Each
    // section's HTML is truncated to keep token usage reasonable — this is
    // enough for the assistant to reason about section boundaries/content,
    // not a full-fidelity edit context (contrast with html_edit's use of the
    // exact current HTML for a single section).
    const MAX_HTML_CHARS_PER_SECTION = 4000
    let sections: { sectionIndex: number; html: string }[] | undefined
    if (pageId) {
      const renderingRow = storage.getLatestNodeData("web-rendering", pageId)
      if (renderingRow) {
        const parsed = WebRenderingOutput.safeParse(renderingRow.data)
        if (parsed.success) {
          sections = parsed.data.sections
            .filter((s) => sectionIndex === undefined || s.sectionIndex === sectionIndex)
            .map((s) => ({
              sectionIndex: s.sectionIndex,
              html: s.html.length > MAX_HTML_CHARS_PER_SECTION
                ? s.html.slice(0, MAX_HTML_CHARS_PER_SECTION) + "\n<!-- truncated -->"
                : s.html,
            }))
        }
      }
    }

    // Reusing the caller-supplied correlationId (when the frontend already
    // started one for this conversation) groups every turn together in the
    // LLM logs, same as the ai-edit history view does per-edit.
    const correlationId = options.correlationId ?? crypto.randomUUID()

    const result = await model.generateObject<{ reply: string }>({
      schema: assistantChatLLMSchema,
      prompt: "assistant_chat",
      context: {
        history,
        message,
        page_id: pageId,
        sections,
        docs_base_url: docsBaseUrl,
      },
      maxRetries: 2,
      log: {
        taskType: "assistant",
        pageId,
        promptName: "assistant_chat",
        sectionIndex,
        correlationId,
      },
    })

    return { reply: result.object.reply, correlationId }
  } finally {
    if (previousKey !== undefined) {
      process.env.OPENAI_API_KEY = previousKey
    } else {
      delete process.env.OPENAI_API_KEY
    }
    storage.close()
  }
}
