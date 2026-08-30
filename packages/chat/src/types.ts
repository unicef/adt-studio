import type { z } from "zod"

export const CHAT_THREAD_FORMAT_VERSION = 1

/**
 * Structural mirror of the AI SDK v5 `UIMessage`. Declared locally so the
 * package's public API never re-exports `ai` types — consumers stay on their
 * own `ai` version, or on none at all.
 */
export interface ChatUiMessage {
  id: string
  role: "system" | "user" | "assistant"
  metadata?: unknown
  parts: ChatUiPart[]
}

export interface ChatUiPart {
  type: string
  [key: string]: unknown
}

export interface ChatThread {
  formatVersion: number
  threadId: string
  chatId: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  messages: ChatUiMessage[]
  /** Tool calls already run by the approval pre-pass, recorded for idempotency. */
  executedToolCallIds: string[]
}

export interface ChatThreadSummary {
  threadId: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

/**
 * The schema's *input* type is left open so tools can use `.default()` and
 * `.optional()` without their parsed shape having to match the wire shape.
 */
export type ChatToolSchema<Input> = z.ZodType<Input, z.ZodTypeDef, unknown>

export interface ChatTool<Ctx = unknown, Input = never> {
  name: string
  description: string
  inputSchema: ChatToolSchema<Input>
  /** Mutating tools stream without an executor so the user approves them first. */
  mutating: boolean
  execute: (ctx: Ctx, input: Input) => Promise<unknown> | unknown
}

/** A tool of any input shape, as held by a registry. */
export type AnyChatTool<Ctx> = Omit<ChatTool<Ctx, never>, "inputSchema" | "execute"> & {
  inputSchema: ChatToolSchema<never>
  execute: (ctx: Ctx, input: never) => Promise<unknown> | unknown
}

export interface ChatCredentials {
  openaiApiKey?: string
  anthropicApiKey?: string
  googleApiKey?: string
}

export interface ChatTurnUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}
