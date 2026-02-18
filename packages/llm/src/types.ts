export interface LLMModel {
  generateObject<T>(options: GenerateObjectOptions): Promise<GenerateObjectResult<T>>
}

export interface GenerateObjectOptions {
  schema: unknown

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
  log?: {
    taskType: string
    pageId?: string
    promptName: string
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
