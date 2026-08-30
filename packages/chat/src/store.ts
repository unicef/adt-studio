import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  CHAT_THREAD_FORMAT_VERSION,
  type ChatThread,
  type ChatThreadSummary,
  type ChatUiMessage,
} from "./types.js"

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export class ChatThreadConflictError extends Error {
  constructor(threadId: string) {
    super(`Chat thread ${threadId} was modified by another writer`)
    this.name = "ChatThreadConflictError"
  }
}

export class ChatThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Chat thread not found: ${threadId}`)
    this.name = "ChatThreadNotFoundError"
  }
}

export interface CreateThreadInput {
  model: string
  title?: string
  threadId?: string
}

export interface SaveThreadOptions {
  /** `updatedAt` the caller loaded; a mismatch on disk rejects the write. */
  expectedUpdatedAt?: string
}

export interface ChatStore {
  listThreads(chatId: string): ChatThreadSummary[]
  createThread(chatId: string, input: CreateThreadInput): ChatThread
  getThread(chatId: string, threadId: string): ChatThread | undefined
  requireThread(chatId: string, threadId: string): ChatThread
  saveThread(thread: ChatThread, options?: SaveThreadOptions): ChatThread
  deleteThread(chatId: string, threadId: string): boolean
}

function assertId(kind: string, value: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Invalid chat ${kind}: ${value}`)
  }
  return value
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeThread(raw: unknown, chatId: string, threadId: string): ChatThread | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const value = raw as Partial<ChatThread>
  const messages = Array.isArray(value.messages) ? (value.messages as ChatUiMessage[]) : []
  const executed = Array.isArray(value.executedToolCallIds)
    ? value.executedToolCallIds.filter((id): id is string => typeof id === "string")
    : []
  return {
    formatVersion:
      typeof value.formatVersion === "number" ? value.formatVersion : CHAT_THREAD_FORMAT_VERSION,
    threadId: typeof value.threadId === "string" ? value.threadId : threadId,
    chatId: typeof value.chatId === "string" ? value.chatId : chatId,
    title: typeof value.title === "string" ? value.title : "",
    model: typeof value.model === "string" ? value.model : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    messages,
    executedToolCallIds: executed,
  }
}

/**
 * Threads live outside the book database on purpose: a chat-only table would
 * bump `SCHEMA_VERSION`, which feeds the pipeline identity hash and would
 * invalidate part compatibility across app versions.
 */
export function createChatStore(chatsDir: string): ChatStore {
  const rootDir = path.resolve(chatsDir)

  function chatDir(chatId: string): string {
    return path.join(rootDir, assertId("id", chatId))
  }

  function threadPath(chatId: string, threadId: string): string {
    return path.join(chatDir(chatId), `${assertId("thread id", threadId)}.json`)
  }

  function readThreadFile(chatId: string, threadId: string): ChatThread | undefined {
    const filePath = threadPath(chatId, threadId)
    if (!fs.existsSync(filePath)) return undefined
    try {
      return normalizeThread(JSON.parse(fs.readFileSync(filePath, "utf8")), chatId, threadId)
    } catch {
      return undefined
    }
  }

  function writeThreadFile(thread: ChatThread): void {
    const dir = chatDir(thread.chatId)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = threadPath(thread.chatId, thread.threadId)
    const tmpPath = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
    fs.writeFileSync(tmpPath, `${JSON.stringify(thread, null, 2)}\n`, "utf8")
    fs.renameSync(tmpPath, filePath)
  }

  return {
    listThreads(chatId) {
      const dir = chatDir(chatId)
      if (!fs.existsSync(dir)) return []
      return fs
        .readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => readThreadFile(chatId, name.slice(0, -".json".length)))
        .filter((thread): thread is ChatThread => thread !== undefined)
        .map((thread) => ({
          threadId: thread.threadId,
          title: thread.title,
          model: thread.model,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          messageCount: thread.messages.length,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    createThread(chatId, input) {
      const timestamp = nowIso()
      const thread: ChatThread = {
        formatVersion: CHAT_THREAD_FORMAT_VERSION,
        threadId: input.threadId ? assertId("thread id", input.threadId) : randomUUID(),
        chatId: assertId("id", chatId),
        title: input.title ?? "",
        model: input.model,
        createdAt: timestamp,
        updatedAt: timestamp,
        messages: [],
        executedToolCallIds: [],
      }
      writeThreadFile(thread)
      return thread
    },

    getThread(chatId, threadId) {
      return readThreadFile(chatId, threadId)
    },

    requireThread(chatId, threadId) {
      const thread = readThreadFile(chatId, threadId)
      if (!thread) throw new ChatThreadNotFoundError(threadId)
      return thread
    },

    saveThread(thread, options = {}) {
      const onDisk = readThreadFile(thread.chatId, thread.threadId)
      if (
        options.expectedUpdatedAt !== undefined &&
        onDisk !== undefined &&
        onDisk.updatedAt !== options.expectedUpdatedAt
      ) {
        throw new ChatThreadConflictError(thread.threadId)
      }
      const next: ChatThread = { ...thread, updatedAt: nowIso() }
      writeThreadFile(next)
      return next
    },

    deleteThread(chatId, threadId) {
      const filePath = threadPath(chatId, threadId)
      if (!fs.existsSync(filePath)) return false
      fs.rmSync(filePath)
      return true
    },
  }
}
