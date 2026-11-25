import { z } from "zod"

export const CHAT_MESSAGE_MAX_LENGTH = 8000

export interface ChatToolCall {
  id: string
  toolName: string
  args: unknown
}
export const ChatToolCall = z.object({
  id: z.string(),
  toolName: z.string(),
  args: z.unknown(),
}) as z.ZodType<ChatToolCall>

export interface ChatToolResult {
  id: string
  toolName: string
  result: unknown
  isError?: boolean
}
export const ChatToolResult = z.object({
  id: z.string(),
  toolName: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
}) as z.ZodType<ChatToolResult>

export const ChatMessage = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string() }),
  z.object({ role: z.literal("assistant"), text: z.string(), toolCalls: z.array(ChatToolCall) }),
  z.object({ role: z.literal("tool"), results: z.array(ChatToolResult) }),
])
export type ChatMessage = z.infer<typeof ChatMessage>

export const ChatThreadSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ChatThreadSummary = z.infer<typeof ChatThreadSummary>

export const ChatThread = ChatThreadSummary.extend({
  messages: z.array(ChatMessage),
  pendingToolCalls: z.array(ChatToolCall).default([]),
})
export type ChatThread = z.infer<typeof ChatThread>

export const ChatSendRequest = z.object({
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
})
export type ChatSendRequest = z.infer<typeof ChatSendRequest>

export const ChatApprovalRequest = z.object({
  decisions: z.record(z.string(), z.boolean()),
})
export type ChatApprovalRequest = z.infer<typeof ChatApprovalRequest>

export const ChatStreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), message: ChatMessage }),
  z.object({ type: z.literal("done"), thread: ChatThread }),
  z.object({ type: z.literal("error"), message: z.string() }),
])
export type ChatStreamEvent = z.infer<typeof ChatStreamEvent>
