import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  availableChatModels,
  ChatThreadConflictError,
  ChatThreadNotFoundError,
  DEFAULT_CHAT_MODEL,
  deriveThreadTitle,
  firstUserText,
  MissingChatCredentialError,
  preprocessApprovals,
  streamChatTurn,
  type ChatCredentials,
  type ChatThread,
  type ChatUiMessage,
} from "@adt/chat"
import { createChatService, type ChatService } from "../services/chat/chat-service.js"
import { buildChatSystemPrompt } from "../services/chat/system-prompt.js"
import { buildBookOverview } from "../services/chat/tools/book-overview.js"
import { buildToolPreview } from "../services/chat/tool-preview.js"
import { createBookChatTools } from "../services/chat/tools.js"
import type { ChatPaths, ChatToolContext } from "../services/chat/context.js"
import type { StageService } from "../services/stage-service.js"
import type { TaskService } from "../services/task-service.js"

const ChatUiPartSchema = z.object({ type: z.string() }).passthrough()

const ChatUiMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["system", "user", "assistant"]),
  metadata: z.unknown().optional(),
  parts: z.array(ChatUiPartSchema),
})

const ScreenContextSchema = z.object({
  screen: z.string().max(64).optional(),
  pageId: z.string().max(128).optional(),
  pageLabel: z.string().max(256).optional(),
  sectionIndex: z.number().int().nonnegative().optional(),
  stage: z.string().max(64).optional(),
  language: z.string().max(32).optional(),
})

const SendMessagesSchema = z.object({
  messages: z.array(ChatUiMessageSchema).min(1).max(500),
  model: z.string().min(1).max(128).optional(),
  locale: z.string().min(2).max(16).optional(),
  screenContext: ScreenContextSchema.optional(),
})

const ToolPreviewSchema = z.object({
  toolName: z.string().min(1).max(64),
  input: z.unknown(),
})

const CreateThreadSchema = z.object({
  model: z.string().min(1).max(128).optional(),
  title: z.string().max(200).optional(),
})

const PatchThreadSchema = z.object({
  model: z.string().min(1).max(128).optional(),
  title: z.string().max(200).optional(),
})

function readCredentials(c: Context): ChatCredentials {
  return {
    openaiApiKey: c.req.header("X-OpenAI-Key") || undefined,
    anthropicApiKey: c.req.header("X-Anthropic-API-Key") || undefined,
    googleApiKey: c.req.header("X-Google-API-Key") || undefined,
  }
}

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" })
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid body" })
  }
  return parsed.data
}

function requireThread(service: ChatService, chatId: string, threadId: string): ChatThread {
  try {
    return service.store.requireThread(chatId, threadId)
  } catch (err) {
    if (err instanceof ChatThreadNotFoundError) {
      throw new HTTPException(404, { message: err.message })
    }
    throw err
  }
}

function toSummary(thread: ChatThread) {
  return {
    threadId: thread.threadId,
    title: thread.title,
    model: thread.model,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
  }
}

export function createChatRoutes(
  paths: ChatPaths,
  stageService: StageService,
  taskService: TaskService,
): Hono {
  const app = new Hono()
  const service = createChatService(paths.booksDir)
  const registry = createBookChatTools()

  app.get("/books/:label/chat/models", (c) => {
    service.resolveBook(c.req.param("label"))
    return c.json({ models: availableChatModels(readCredentials(c)) })
  })

  app.post("/books/:label/chat/tool-preview", async (c) => {
    const { safeLabel } = service.resolveBook(c.req.param("label"))
    const body = await parseBody(c, ToolPreviewSchema)
    if (!registry.get(body.toolName)?.mutating) {
      throw new HTTPException(400, {
        message: `Not a mutating tool: ${body.toolName}`,
      })
    }
    return c.json(buildToolPreview(paths.booksDir, safeLabel, body.toolName, body.input))
  })

  app.get("/books/:label/chat/threads", (c) => {
    const { chatId } = service.resolveBook(c.req.param("label"))
    return c.json({ threads: service.store.listThreads(chatId) })
  })

  app.post("/books/:label/chat/threads", async (c) => {
    const { chatId } = service.resolveBook(c.req.param("label"))
    const body = await parseBody(c, CreateThreadSchema)
    const thread = service.store.createThread(chatId, {
      model: body.model ?? DEFAULT_CHAT_MODEL,
      title: body.title,
    })
    return c.json(toSummary(thread), 201)
  })

  app.get("/books/:label/chat/threads/:threadId", (c) => {
    const { chatId } = service.resolveBook(c.req.param("label"))
    const thread = requireThread(service, chatId, c.req.param("threadId"))
    return c.json(thread)
  })

  app.patch("/books/:label/chat/threads/:threadId", async (c) => {
    const { chatId } = service.resolveBook(c.req.param("label"))
    const thread = requireThread(service, chatId, c.req.param("threadId"))
    const body = await parseBody(c, PatchThreadSchema)
    const saved = service.store.saveThread({
      ...thread,
      title: body.title ?? thread.title,
      model: body.model ?? thread.model,
    })
    return c.json(toSummary(saved))
  })

  app.delete("/books/:label/chat/threads/:threadId", (c) => {
    const { chatId } = service.resolveBook(c.req.param("label"))
    const threadId = c.req.param("threadId")
    service.cancelTurn(chatId, threadId)
    if (!service.store.deleteThread(chatId, threadId)) {
      throw new HTTPException(404, { message: `Chat thread not found: ${threadId}` })
    }
    return c.body(null, 204)
  })

  app.post("/books/:label/chat/threads/:threadId/cancel", (c) => {
    const { chatId } = service.resolveBook(c.req.param("label"))
    const cancelled = service.cancelTurn(chatId, c.req.param("threadId"))
    return c.json({ cancelled })
  })

  app.post("/books/:label/chat/threads/:threadId/messages", async (c) => {
    const { safeLabel, chatId } = service.resolveBook(c.req.param("label"))
    const threadId = c.req.param("threadId")
    const stored = requireThread(service, chatId, threadId)
    const body = await parseBody(c, SendMessagesSchema)
    const credentials = readCredentials(c)

    const incoming = body.messages as ChatUiMessage[]
    const modelId = body.model ?? stored.model ?? DEFAULT_CHAT_MODEL
    const locale = body.locale ?? "en"
    const screen = body.screenContext ?? {}

    let current: ChatThread
    try {
      current = service.store.saveThread(
        {
          ...stored,
          model: modelId,
          title: stored.title || deriveThreadTitle(firstUserText(incoming)),
          messages: incoming,
        },
        { expectedUpdatedAt: stored.updatedAt },
      )
    } catch (err) {
      if (err instanceof ChatThreadConflictError) {
        throw new HTTPException(409, { message: err.message })
      }
      throw err
    }

    const controller = service.beginTurn(chatId, threadId)
    c.req.raw.signal.addEventListener("abort", () => controller.abort(), { once: true })

    const toolContext: ChatToolContext = {
      paths,
      safeLabel,
      chatId,
      threadId,
      credentials,
      locale,
      screen,
      stageService,
      taskService,
      signal: controller.signal,
    }

    const approvals = await preprocessApprovals({
      messages: incoming,
      registry,
      context: toolContext,
      executedToolCallIds: current.executedToolCallIds,
      persistedMessages: stored.messages,
    })

    current = service.store.saveThread(
      {
        ...current,
        messages: approvals.messages,
        executedToolCallIds: approvals.executedToolCallIds,
      },
      { expectedUpdatedAt: current.updatedAt },
    )

    const correlationId = randomUUID()

    try {
      return streamChatTurn({
        modelId,
        credentials,
        system: buildChatSystemPrompt({
          bookLabel: safeLabel,
          locale,
          screen,
          bookOverview: buildBookOverview(safeLabel, paths.booksDir),
        }),
        messages: approvals.messages,
        registry,
        context: toolContext,
        abortSignal: controller.signal,
        onTurnFinish: (event) => {
          try {
            service.appendLlmLog(safeLabel, {
              threadId,
              correlationId,
              modelId,
              durationMs: event.durationMs,
              requestMessages: event.requestMessages,
              responseText: event.responseText,
              usage: event.usage,
              error: event.error,
            })
          } catch {
            // Logging must never break the stream.
          }
        },
        onPersist: (messages) => {
          try {
            current = service.store.saveThread(
              { ...current, messages },
              { expectedUpdatedAt: current.updatedAt },
            )
          } catch {
            // Another writer won; the client reloads the thread instead.
          }
          service.endTurn(chatId, threadId, controller)
        },
      })
    } catch (err) {
      service.endTurn(chatId, threadId, controller)
      if (err instanceof MissingChatCredentialError) {
        throw new HTTPException(400, {
          message: `${err.message}. Add the key in Settings → Providers.`,
        })
      }
      throw err
    }
  })

  return app
}
