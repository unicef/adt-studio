import type { ResolvedCredentials } from "./credentials.js"

export interface LLMProviderCredentials {
  openaiApiKey?: string
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
}

const LEGACY_FIELD_MAP: ReadonlyArray<
  readonly [keyof LLMProviderCredentials, string, string]
> = [
  ["openaiApiKey", "openai", "apiKey"],
  ["anthropicApiKey", "anthropic", "apiKey"],
  ["googleApiKey", "google", "apiKey"],
  ["customBaseUrl", "custom", "baseUrl"],
  ["customApiKey", "custom", "apiKey"],
]

export function toResolvedCredentials(
  legacy: LLMProviderCredentials | undefined,
): ResolvedCredentials {
  const resolved: ResolvedCredentials = {}
  if (!legacy) return resolved

  for (const [field, providerId, key] of LEGACY_FIELD_MAP) {
    const value = legacy[field]?.trim()
    if (!value) continue
    resolved[providerId] = { ...resolved[providerId], [key]: value }
  }
  return resolved
}

export function mergeResolvedCredentials(
  ...sources: ReadonlyArray<ResolvedCredentials | undefined>
): ResolvedCredentials {
  const merged: ResolvedCredentials = {}
  for (const source of sources) {
    for (const [providerId, values] of Object.entries(source ?? {})) {
      merged[providerId] = { ...merged[providerId], ...values }
    }
  }
  return merged
}
