import type { StructuredOutputStrategy } from "@adt/types"
import type { Message } from "../types.js"
import type { TokenUsage } from "./common.js"

/**
 * The effective strategy is computed from these traits plus the provider's
 * declared capabilities — call sites never name a strategy themselves.
 */
export interface StructuredRequestTraits {
  /** `z.lazy()` recursion or `$ref`s, which strict schema mode rejects. */
  recursiveSchema?: boolean
  /** Open-ended arms (`z.any()`, `z.record()`) a strict schema cannot express. */
  looseSchema?: boolean
  imageInput?: boolean
}

export interface StructuredTextRequest {
  system?: string
  messages: Message[]
  schema: unknown
  strategy: StructuredOutputStrategy
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  signal?: AbortSignal
  /** Adapter-specific escape hatch; participates in the cache key. */
  providerOptions?: Record<string, unknown>
}

export interface StructuredTextResult<T> {
  object: T
  usage: TokenUsage
  /** Present only when the adapter parsed the object client-side. */
  rawText?: string
}

export interface StructuredTextBackend {
  generateStructured<T>(
    request: StructuredTextRequest,
  ): Promise<StructuredTextResult<T>>
  /**
   * The instructions this backend appends to `request.system` on the wire, in
   * order, so the caller can log the prompt the model actually sees. Absent or
   * empty when the backend sends the system prompt unchanged.
   */
  systemAdditions?(request: StructuredTextRequest): string[]
}

/** The system prompt as the model sees it: the caller's, then each addition. */
export function appendSystemAdditions(
  system: string | undefined,
  additions: readonly string[],
): string | undefined {
  const parts = [...(system ? [system] : []), ...additions]
  return parts.length > 0 ? parts.join("\n\n") : undefined
}
