import { generateText, type CoreMessage, type CoreTool, type LanguageModel } from "ai"
import type {
  AgentBackend,
  AgentMessage,
  AgentToolDefinition,
  AgentTurnRequest,
  AgentTurnResponse,
} from "../../../ports/index.js"

const DEFAULT_TIMEOUT_MS = 5 * 60_000

export function createAiSdkAgentBackend(model: LanguageModel): AgentBackend {
  return {
    async generateTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
      const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      const abortSignal = request.signal
        ? AbortSignal.any([timeout, request.signal])
        : timeout

      const result = await generateText({
        model,
        system: request.system,
        messages: toCoreMessages(request.messages),
        tools: toCoreTools(request.tools),
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        abortSignal,
      })

      return {
        text: result.text ?? "",
        toolCalls: (result.toolCalls ?? []).map((call) => ({
          id: call.toolCallId,
          toolName: call.toolName,
          args: call.args,
        })),
        finishReason: result.finishReason,
        usage: {
          inputTokens: result.usage?.promptTokens ?? 0,
          outputTokens: result.usage?.completionTokens ?? 0,
        },
      }
    },
  }
}

/** No `execute`: the SDK must return tool calls instead of running the loop itself. */
function toCoreTools(tools: AgentToolDefinition[]): Record<string, CoreTool> {
  const converted: Record<string, CoreTool> = {}
  for (const tool of tools) {
    converted[tool.name] = {
      description: tool.description,
      parameters: tool.parameters,
    } as unknown as CoreTool
  }
  return converted
}

function toCoreMessages(messages: AgentMessage[]): CoreMessage[] {
  return messages.map((message): CoreMessage => {
    if (message.role === "user") {
      return { role: "user", content: message.content }
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: [
          ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
          ...message.toolCalls.map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.toolName,
            args: call.args,
          })),
        ],
      }
    }
    return {
      role: "tool",
      content: message.results.map((result) => ({
        type: "tool-result" as const,
        toolCallId: result.id,
        toolName: result.toolName,
        result: result.result,
        isError: result.isError,
      })),
    }
  })
}
