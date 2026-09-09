import type { TokenUsage } from "./common.js"

/**
 * `parameters` is a Zod schema; adapters translate it into their SDK's shape.
 * Tool execution is a side effect owned by the loop and is never cached.
 */
export interface AgentTool<Args = any, Result = unknown> {
  description: string
  parameters: unknown
  execute: (args: Args) => Promise<Result> | Result
}

export type AgentToolSet = Record<string, AgentTool<any, any>>

export function defineAgentTool<Args, Result>(
  definition: AgentTool<Args, Result>,
): AgentTool<Args, Result> {
  return definition
}

/** What the model is shown; deliberately excludes `execute`. */
export interface AgentToolDefinition {
  name: string
  description: string
  parameters: unknown
}

export interface AgentToolCall {
  id: string
  toolName: string
  args: unknown
}

export interface AgentToolResult {
  id: string
  toolName: string
  result: unknown
  isError?: boolean
}

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; text: string; toolCalls: AgentToolCall[] }
  | { role: "tool"; results: AgentToolResult[] }

export interface AgentTurnRequest {
  system: string
  messages: AgentMessage[]
  tools: AgentToolDefinition[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface AgentTurnResponse {
  text: string
  toolCalls: AgentToolCall[]
  finishReason: string
  usage: TokenUsage
}

/**
 * One model inference, no tool execution and no loop: the loop lives in ADT so
 * every turn can be cached and logged independently of the provider.
 */
export interface AgentBackend {
  generateTurn(request: AgentTurnRequest): Promise<AgentTurnResponse>
}

export interface AgentTurn {
  index: number
  text: string
  toolCalls: AgentToolCall[]
  toolResults: AgentToolResult[]
  finishReason: string
  usage: TokenUsage
  cacheHit: boolean
}

export interface AgentRunResult {
  text: string
  stepCount: number
  usage: TokenUsage
  finishReason: string
  turns: AgentTurn[]
}
