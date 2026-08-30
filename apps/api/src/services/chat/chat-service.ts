import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import { createBookStorage, resolveBookPaths } from "@adt/storage"
import {
  createChatStore,
  getChatsDir,
  resolveChatId,
  type ChatLogMessage,
  type ChatStore,
  type ChatTurnUsage,
} from "@adt/chat"

export interface ResolvedBookChat {
  safeLabel: string
  bookDir: string
  chatId: string
}

export interface ChatLlmLogInput {
  threadId: string
  correlationId: string
  modelId: string
  durationMs: number
  requestMessages: ChatLogMessage[]
  responseText: string
  usage?: ChatTurnUsage
  error?: string
}

export interface ChatService {
  readonly store: ChatStore
  resolveBook(label: string): ResolvedBookChat
  /** Register the abort controller for a thread's in-flight turn. */
  beginTurn(chatId: string, threadId: string): AbortController
  endTurn(chatId: string, threadId: string, controller: AbortController): void
  cancelTurn(chatId: string, threadId: string): boolean
  appendLlmLog(safeLabel: string, input: ChatLlmLogInput): void
}

export function createChatService(booksDir: string): ChatService {
  const store = createChatStore(getChatsDir(booksDir))
  const inFlight = new Map<string, AbortController>()

  const turnKey = (chatId: string, threadId: string) => `${chatId}/${threadId}`

  return {
    store,

    resolveBook(label) {
      let safeLabel: string
      try {
        safeLabel = parseBookLabel(label)
      } catch (err) {
        throw new HTTPException(400, {
          message: err instanceof Error ? err.message : String(err),
        })
      }
      const { bookDir } = resolveBookPaths(safeLabel, booksDir)
      if (!fs.existsSync(bookDir)) {
        throw new HTTPException(404, { message: `Book not found: ${safeLabel}` })
      }
      return { safeLabel, bookDir, chatId: resolveChatId(bookDir) }
    },

    beginTurn(chatId, threadId) {
      const key = turnKey(chatId, threadId)
      inFlight.get(key)?.abort()
      const controller = new AbortController()
      inFlight.set(key, controller)
      return controller
    },

    endTurn(chatId, threadId, controller) {
      const key = turnKey(chatId, threadId)
      if (inFlight.get(key) === controller) inFlight.delete(key)
    },

    cancelTurn(chatId, threadId) {
      const controller = inFlight.get(turnKey(chatId, threadId))
      if (!controller) return false
      controller.abort()
      inFlight.delete(turnKey(chatId, threadId))
      return true
    },

    /**
     * Chat calls join the book's existing llm_log so the debug panel stays as
     * honest for chat as it is for pipeline calls. `step` is free text, so no
     * schema change and no SCHEMA_VERSION bump is involved.
     */
    appendLlmLog(safeLabel, input) {
      const storage = createBookStorage(safeLabel, booksDir)
      try {
        storage.appendLlmLog({
          requestId: randomUUID(),
          timestamp: new Date().toISOString(),
          taskType: "chat",
          pageId: input.threadId,
          promptName: "chat",
          modelId: input.modelId,
          cacheHit: false,
          success: !input.error,
          errorCount: input.error ? 1 : 0,
          attempt: 1,
          durationMs: input.durationMs,
          usage: {
            inputTokens: input.usage?.inputTokens ?? 0,
            outputTokens: input.usage?.outputTokens ?? 0,
          },
          error: input.error,
          correlationId: input.correlationId,
          messages: [
            ...input.requestMessages.map((message) => ({
              role: message.role,
              content: [{ type: "text" as const, text: message.text }],
            })),
            ...(input.responseText
              ? [
                  {
                    role: "assistant",
                    content: [{ type: "text" as const, text: input.responseText }],
                  },
                ]
              : []),
          ],
        })
      } finally {
        storage.close()
      }
    },
  }
}
