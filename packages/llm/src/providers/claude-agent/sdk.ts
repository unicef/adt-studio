export interface ClaudeAgentTextBlock {
  type: "text"
  text: string
}

export interface ClaudeAgentImageBlock {
  type: "image"
  source: { type: "base64"; media_type: string; data: string }
}

export type ClaudeAgentContentBlock = ClaudeAgentTextBlock | ClaudeAgentImageBlock

export interface ClaudeAgentUserMessage {
  type: "user"
  message: { role: "user"; content: ClaudeAgentContentBlock[] }
  parent_tool_use_id: null
}

export interface ClaudeAgentUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface ClaudeAgentResultMessage {
  type: "result"
  subtype: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  usage?: ClaudeAgentUsage
  total_cost_usd?: number
  errors?: string[]
  session_id?: string
}

export interface ClaudeAgentOtherMessage {
  type: string
}

export type ClaudeAgentMessage = ClaudeAgentResultMessage | ClaudeAgentOtherMessage

export function isResultMessage(
  message: ClaudeAgentMessage,
): message is ClaudeAgentResultMessage {
  return message.type === "result"
}

/**
 * Only the subset the structured-text adapter drives. Declared locally so the
 * SDK's own `.d.ts` (which imports unmet peer types) never enters the program
 * and so tests can inject a fake `query`.
 */
export interface ClaudeAgentQueryOptions {
  model?: string
  systemPrompt?: string
  cwd?: string
  maxTurns?: number
  tools?: string[]
  settingSources?: string[]
  persistSession?: boolean
  permissionMode?: "default" | "plan" | "acceptEdits" | "bypassPermissions" | "dontAsk"
  outputFormat?: { type: "json_schema"; schema: Record<string, unknown> }
  thinking?: { type: "disabled" }
  abortController?: AbortController
  env?: Record<string, string | undefined>
  stderr?: (data: string) => void
}

export interface ClaudeAgentModelInfo {
  value: string
  resolvedModel?: string
  displayName?: string
  description?: string
}

/** `supportedModels` stays optional so plain async generators remain valid fakes. */
export type ClaudeAgentQueryStream = AsyncIterable<ClaudeAgentMessage> & {
  supportedModels?: () => Promise<ClaudeAgentModelInfo[]>
}

export type ClaudeAgentQuery = (params: {
  prompt: string | AsyncIterable<ClaudeAgentUserMessage>
  options?: ClaudeAgentQueryOptions
}) => ClaudeAgentQueryStream

let sdkPromise: Promise<{ query: ClaudeAgentQuery }> | undefined

/** Lazy: the eager import costs boot time and pulls in the CLI executable. */
export function loadClaudeAgentQuery(): Promise<ClaudeAgentQuery> {
  sdkPromise ??= import("@anthropic-ai/claude-agent-sdk") as unknown as Promise<{
    query: ClaudeAgentQuery
  }>
  return sdkPromise.then((module) => module.query)
}
