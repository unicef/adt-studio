import type { PromptRenderOptions } from "./prompt.js"

export interface LLMModel {
  generateObject<T>(options: GenerateObjectOptions): Promise<GenerateObjectResult<T>>
  /** Render a Liquid prompt template to messages (system + user/assistant). */
  renderPrompt(
    name: string,
    context: Record<string, unknown>,
    options?: PromptRenderOptions,
  ): Promise<Message[]>
}

export interface GenerateObjectOptions {
  schema: unknown

  /**
   * Structured-output mode passed to the AI SDK's generateObject.
   * - "auto" (default): SDK picks — typically maps to OpenAI structured outputs,
   *   which enforce the JSON schema server-side. Does NOT work for recursive
   *   schemas (OpenAI rejects $refs at `items` positions under strict mode).
   * - "json": JSON mode; schema is described in the prompt and parsed, but NOT
   *   enforced server-side. For OpenAI this is achieved by disabling the
   *   provider's `structuredOutputs` flag — otherwise reasoning models
   *   (gpt-5.x, o-series) still emit `response_format: json_schema, strict: true`
   *   and reject recursive schemas. Use this whenever the schema contains
   *   z.lazy() recursion or z.any() arms.
   */
  mode?: "auto" | "json" | "tool"

  /** Provide either prompt (rendered via prompt engine) or system + messages directly */
  prompt?: string
  context?: Record<string, unknown>
  system?: string
  messages?: Message[]

  validate?: (result: unknown, context: Record<string, unknown>) => ValidationResult
  maxRetries?: number
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  /** External cancellation signal. Combined with the internal request timeout;
   *  when it aborts, the in-flight call aborts and the retry loop stops. */
  signal?: AbortSignal
  log?: {
    taskType: string
    pageId?: string
    promptName: string
    requestedPromptName?: string
    sectionIndex?: number
    correlationId?: string
  }
}

export interface GenerateObjectResult<T> {
  object: T
  usage?: TokenUsage
  cached?: boolean
}

export interface Message {
  role: "user" | "assistant" | "system"
  content: string | ContentPart[]
}

export type ContentPart = TextPart | ImagePart

export interface TextPart {
  type: "text"
  text: string
}

export interface ImagePart {
  type: "image"
  image: string // base64
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  /** If set, replaces the result object when validation passes */
  cleaned?: unknown
}
