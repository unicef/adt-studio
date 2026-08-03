import type { AiModality, DiscoveredModel } from "@adt/types"
import type { LogLevel } from "../logger.js"

export type { DiscoveredModel }

export type ProviderCredentialValues = Record<string, string>

export interface BackendContext<C = ProviderCredentialValues> {
  providerId: string
  modelId: string
  modality: AiModality
  credentials: C
  logLevel?: LogLevel
}

/**
 * Passed to a provider's `listModels`. Provider-scoped, not model-scoped: it
 * carries validated credentials but no model id, and discovery is always
 * advisory — the returned list never feeds validation.
 */
export interface ModelListContext<C = ProviderCredentialValues> {
  providerId: string
  credentials: C
  signal?: AbortSignal
  logLevel?: LogLevel
}

export type BackendFactory<B, C = ProviderCredentialValues> = (
  context: BackendContext<C>,
) => B

/** Everything here participates in the cache key, so it must never hold a secret. */
export interface CacheFingerprint {
  /** Bump when the adapter's request shape changes semantically. */
  adapterVersion: string
  /** `https://host:port`; omitted for providers with a single fixed origin. */
  origin?: string
  extra?: Record<string, string | number | boolean>
  /**
   * True when `origin` is derived from user configuration (a base URL header or
   * setting). The legacy v1 cache key never recorded the origin, so a legacy hit
   * cannot be proven to come from the same endpoint — dual-read must skip it.
   */
  configurableOrigin?: boolean
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}
