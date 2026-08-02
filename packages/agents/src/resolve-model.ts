import { createOpenAI, openai } from "@ai-sdk/openai"
import { anthropic, createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import type { LanguageModel } from "ai"

export interface AgentCredentials {
  openaiApiKey?: string
  anthropicApiKey?: string
  googleApiKey?: string
}

/**
 * Resolve a "provider:model" string (e.g. "openai:gpt-5") to a Vercel AI SDK
 * LanguageModel suitable for generateText with tools. Mirrors the resolver in
 * @adt/llm but exposes the raw model, since the agent loop here uses
 * generateText rather than the wrapped generateObject pipeline.
 *
 * Each provider is authenticated with its OWN key from `credentials` — never
 * cross-wired. A model string for a provider whose key wasn't supplied falls
 * back to the SDK's default client (which reads that provider's env var) and
 * surfaces a clear auth error if neither is present.
 */
export function resolveAgentModel(
  modelId: string,
  credentials?: AgentCredentials,
): LanguageModel {
  const colonIdx = modelId.indexOf(":")
  const provider = colonIdx >= 0 ? modelId.slice(0, colonIdx) : "openai"
  const model = colonIdx >= 0 ? modelId.slice(colonIdx + 1) : modelId

  switch (provider) {
    case "openai": {
      const client = credentials?.openaiApiKey
        ? createOpenAI({ apiKey: credentials.openaiApiKey })
        : openai
      return client(model)
    }
    case "anthropic": {
      const client = credentials?.anthropicApiKey
        ? createAnthropic({ apiKey: credentials.anthropicApiKey })
        : anthropic
      return client(model)
    }
    case "google": {
      const client = credentials?.googleApiKey
        ? createGoogleGenerativeAI({ apiKey: credentials.googleApiKey })
        : google
      return client(model)
    }
    default:
      throw new Error(`Unsupported agent provider: ${provider}`)
  }
}
