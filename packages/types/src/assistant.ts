import { z } from "zod"

export const AssistantChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
})
export type AssistantChatMessage = z.infer<typeof AssistantChatMessage>

export const AssistantChatRequest = z.object({
  message: z.string().min(1),
  history: z.array(AssistantChatMessage).default([]),
  pageId: z.string().optional(),
  sectionIndex: z.number().int().optional(),
  correlationId: z.string().optional(),
})
export type AssistantChatRequest = z.infer<typeof AssistantChatRequest>

export const AssistantChatResponse = z.object({
  reply: z.string(),
  correlationId: z.string(),
})
export type AssistantChatResponse = z.infer<typeof AssistantChatResponse>

export const assistantChatLLMSchema = z.object({
  reply: z.string(),
})
