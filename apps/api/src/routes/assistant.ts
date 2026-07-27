import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { AssistantChatRequest, parseBookLabel } from "@adt/types"
import { assistantChat } from "../services/assistant-chat-service.js"

export function createAssistantRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string,
  docsBaseUrl?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/assistant/chat — guidance-only contextual chat
  app.post("/books/:label/assistant/chat", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const apiKey = c.req.header("X-OpenAI-Key")
    if (!apiKey) {
      throw new HTTPException(400, { message: "Missing X-OpenAI-Key header" })
    }

    const body = await c.req.json()
    const parsed = AssistantChatRequest.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, { message: parsed.error.message })
    }

    const result = await assistantChat({
      label: safeLabel,
      message: parsed.data.message,
      history: parsed.data.history,
      pageId: parsed.data.pageId,
      sectionIndex: parsed.data.sectionIndex,
      correlationId: parsed.data.correlationId,
      booksDir,
      promptsDir,
      configPath,
      docsBaseUrl,
      apiKey,
    })

    return c.json(result)
  })

  return app
}
