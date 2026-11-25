import { Hono, type Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import { ChatApprovalRequest, ChatSendRequest, parseBookLabel, type ChatMode, type ChatScope, type ChatStreamEvent } from "@adt/types"
import { readProviderCredentials } from "../middleware/provider-credentials.js"
import { requireExistingBook } from "../utils/book-exists.js"
import { ChatStateError, runChatTurn, type ChatTurnInput } from "../services/chat/chat-service.js"
import { ChatThreadNotFoundError, createChatThreadStore } from "../services/chat/thread-store.js"

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" })
  }
}

function toHttpError(error: unknown): never {
  if (error instanceof ChatThreadNotFoundError) throw new HTTPException(404, { message: error.message })
  if (error instanceof ChatStateError) throw new HTTPException(409, { message: error.message })
  throw error
}

export function createChatRoutes(booksDir: string, promptsDir: string, configPath?: string, webAssetsDir?: string): Hono {
  const app = new Hono()

  function storeFor(c: Context) {
    const label = parseBookLabel(c.req.param("label") ?? "")
    requireExistingBook(label, booksDir)
    return { label, store: createChatThreadStore(booksDir, label) }
  }

  app.get("/books/:label/chat/threads", (c) => c.json({ threads: storeFor(c).store.list() }))

  app.post("/books/:label/chat/threads", (c) => c.json(storeFor(c).store.create(), 201))

  app.get("/books/:label/chat/threads/:id", (c) => {
    try {
      return c.json(storeFor(c).store.read(c.req.param("id")))
    } catch (error) {
      toHttpError(error)
    }
  })

  app.delete("/books/:label/chat/threads/:id", (c) => {
    const { store } = storeFor(c)
    try {
      store.read(c.req.param("id"))
    } catch (error) {
      toHttpError(error)
    }
    store.remove(c.req.param("id"))
    return c.json({ ok: true })
  })

  function streamTurn(c: Context, input: ChatTurnInput, settings: { mode: ChatMode; scope: ChatScope }) {
    const { label, store } = storeFor(c)
    const threadId = c.req.param("id") ?? ""
    try {
      const thread = store.read(threadId)
      const awaiting = thread.pendingToolCalls.length > 0
      if ("text" in input && awaiting) throw new ChatStateError("Approve or decline the pending action first")
      if ("decisions" in input && !awaiting) throw new ChatStateError("Nothing is waiting for approval")
    } catch (error) {
      toHttpError(error)
    }
    const credentials = readProviderCredentials(c)

    return streamSSE(c, async (stream) => {
      const controller = new AbortController()
      stream.onAbort(() => controller.abort())
      const emit = (event: ChatStreamEvent) =>
        stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      try {
        const thread = await runChatTurn({
          label,
          booksDir,
          promptsDir,
          configPath,
          threadId,
          input,
          ...settings,
          webAssetsDir,
          credentials,
          signal: controller.signal,
          onMessage: (message) => void emit({ type: "message", message }),
        })
        await emit({ type: "done", thread })
      } catch (error) {
        await emit({ type: "error", message: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  app.post("/books/:label/chat/threads/:id/messages", async (c) => {
    const body = ChatSendRequest.safeParse(await readJson(c))
    if (!body.success) throw new HTTPException(400, { message: body.error.message })
    return streamTurn(c, { text: body.data.text, images: body.data.images }, { mode: body.data.mode, scope: body.data.scope })
  })

  app.post("/books/:label/chat/threads/:id/approval", async (c) => {
    const body = ChatApprovalRequest.safeParse(await readJson(c))
    if (!body.success) throw new HTTPException(400, { message: body.error.message })
    return streamTurn(c, { decisions: body.data.decisions }, { mode: body.data.mode, scope: body.data.scope })
  })

  return app
}
