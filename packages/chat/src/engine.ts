import { randomUUID } from "node:crypto"
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai"
import type { ToolSet, UIMessage } from "ai"
import type { z } from "zod"
import type { ChatToolRegistry } from "./registry.js"
import { resolveChatModel } from "./resolve-model.js"
import type { ChatCredentials, ChatTurnUsage, ChatUiMessage } from "./types.js"

export const DEFAULT_MAX_STEPS = 12

export interface ChatLogMessage {
  role: string
  text: string
}

export interface ChatTurnFinishEvent {
  usage?: ChatTurnUsage
  finishReason?: string
  durationMs: number
  requestMessages: ChatLogMessage[]
  responseText: string
  error?: string
}

export interface StreamChatTurnOptions<Ctx> {
  modelId: string
  credentials: ChatCredentials
  system: string
  messages: ChatUiMessage[]
  registry: ChatToolRegistry<Ctx>
  context: Ctx
  maxSteps?: number
  abortSignal?: AbortSignal
  /** Called once the provider call settles, for llm_log bookkeeping. */
  onTurnFinish?: (event: ChatTurnFinishEvent) => void
  /** Called with the full message list to persist, including on abort. */
  onPersist?: (
    messages: ChatUiMessage[],
    info: { aborted: boolean },
  ) => void | Promise<void>
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const record = part as Record<string, unknown>
      if (record.type === "text" && typeof record.text === "string") return record.text
      if (record.type === "tool-call") return `[tool-call ${String(record.toolName)}]`
      if (record.type === "tool-result") return `[tool-result ${String(record.toolName)}]`
      return `[${String(record.type)}]`
    })
    .filter(Boolean)
    .join("\n")
}

function buildToolSet<Ctx>(registry: ChatToolRegistry<Ctx>, context: Ctx): ToolSet {
  const tools: ToolSet = {}
  for (const entry of registry.list()) {
    const inputSchema = entry.inputSchema as unknown as z.ZodTypeAny
    tools[entry.name] = entry.mutating
      ? tool({ description: entry.description, inputSchema })
      : tool({
          description: entry.description,
          inputSchema,
          execute: async (input: unknown) =>
            await entry.execute(context, input as never),
        })
  }
  return tools
}

/**
 * Run one assistant turn and return an AI SDK v5 UI message stream response.
 *
 * Mutating tools are registered without an executor, so the model emitting one
 * ends the stream with the call in `input-available` state — the client renders
 * the approval card from that part and re-submits once the user decides.
 */
export function streamChatTurn<Ctx>({
  modelId,
  credentials,
  system,
  messages,
  registry,
  context,
  maxSteps = DEFAULT_MAX_STEPS,
  abortSignal,
  onTurnFinish,
  onPersist,
}: StreamChatTurnOptions<Ctx>): Response {
  const model = resolveChatModel(modelId, credentials)
  const uiMessages = messages as unknown as UIMessage[]
  const modelMessages = convertToModelMessages(uiMessages)
  const requestMessages: ChatLogMessage[] = [
    { role: "system", text: system },
    ...modelMessages.map((message) => ({
      role: message.role,
      text: flattenContent(message.content),
    })),
  ]
  const startedAt = Date.now()

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    tools: buildToolSet(registry, context),
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    onFinish: ({ usage, finishReason, text }) => {
      onTurnFinish?.({
        usage: {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          reasoningTokens: usage?.reasoningTokens,
          cachedInputTokens: usage?.cachedInputTokens,
        },
        finishReason,
        durationMs: Date.now() - startedAt,
        requestMessages,
        responseText: text,
      })
    },
    onError: ({ error }) => {
      onTurnFinish?.({
        durationMs: Date.now() - startedAt,
        requestMessages,
        responseText: "",
        error: error instanceof Error ? error.message : String(error),
      })
    },
  })

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    // Without this the SDK persists the assistant message with an empty id and
    // the client keeps a different one, so the next request fails validation.
    generateMessageId: () => randomUUID(),
    onFinish: async ({ messages: finalMessages, isAborted }) => {
      await onPersist?.(finalMessages as unknown as ChatUiMessage[], { aborted: isAborted })
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })
}
