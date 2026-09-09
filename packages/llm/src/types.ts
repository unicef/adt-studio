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
   * Semantic traits of the schema. The effective structured-output strategy is
   * derived from these plus the resolved provider's capabilities, so call sites
   * describe the schema, not a provider-specific mode.
   */
  /** `z.lazy()` recursion or `$ref`s, which a strict native schema rejects. */
  recursiveSchema?: boolean
  /** Open-ended arms (`z.any()`, `z.record()`) a strict native schema can't express. */
  looseSchema?: boolean

  /**
   * @deprecated Prefer `recursiveSchema`/`looseSchema`. Explicit override kept
   * for the transition: when it names a strategy the provider offers, it wins
   * over the trait-derived choice; otherwise the provider's preference applies.
   * - "json": force JSON mode; - "tool": force tool calling; - "auto": no override.
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
