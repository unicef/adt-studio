import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import { chatProviderOf } from "./models.js"
import type { ChatCredentials } from "./types.js"

export class MissingChatCredentialError extends Error {
  readonly provider: string

  constructor(provider: string) {
    super(`No API key configured for provider: ${provider}`)
    this.name = "MissingChatCredentialError"
    this.provider = provider
  }
}

/**
 * Resolve a "provider:model" id to an AI SDK v5 LanguageModel. Each provider is
 * authenticated with its own key — never cross-wired — and a missing key fails
 * loudly here rather than as an opaque provider auth error mid-stream.
 */
export function resolveChatModel(
  modelId: string,
  credentials: ChatCredentials,
): LanguageModel {
  const provider = chatProviderOf(modelId)
  const colonIdx = modelId.indexOf(":")
  const model = colonIdx >= 0 ? modelId.slice(colonIdx + 1) : modelId

  switch (provider) {
    case "openai": {
      if (!credentials.openaiApiKey) throw new MissingChatCredentialError(provider)
      return createOpenAI({ apiKey: credentials.openaiApiKey })(model)
    }
    case "anthropic": {
      if (!credentials.anthropicApiKey) throw new MissingChatCredentialError(provider)
      return createAnthropic({ apiKey: credentials.anthropicApiKey })(model)
    }
    case "google": {
      if (!credentials.googleApiKey) throw new MissingChatCredentialError(provider)
      return createGoogleGenerativeAI({ apiKey: credentials.googleApiKey })(model)
    }
  }
}
