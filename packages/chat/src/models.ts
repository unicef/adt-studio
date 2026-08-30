import type { ChatCredentials } from "./types.js"

export type ChatProviderId = "openai" | "anthropic" | "google"

export interface ChatModelOption {
  /** "provider:model", the same convention used by @adt/llm and @adt/agents. */
  id: string
  provider: ChatProviderId
  label: string
}

export const CHAT_MODELS: ChatModelOption[] = [
  { id: "openai:gpt-5.4", provider: "openai", label: "GPT-5.4" },
  { id: "openai:gpt-5.4-mini", provider: "openai", label: "GPT-5.4 mini" },
  { id: "openai:gpt-5.1", provider: "openai", label: "GPT-5.1" },
  { id: "anthropic:claude-opus-4", provider: "anthropic", label: "Claude Opus 4" },
  { id: "anthropic:claude-sonnet-4-5", provider: "anthropic", label: "Claude Sonnet 4.5" },
  { id: "google:gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro" },
  { id: "google:gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash" },
]

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id

export function chatProviderOf(modelId: string): ChatProviderId {
  const colonIdx = modelId.indexOf(":")
  const provider = colonIdx >= 0 ? modelId.slice(0, colonIdx) : "openai"
  if (provider !== "openai" && provider !== "anthropic" && provider !== "google") {
    throw new Error(`Unsupported chat provider: ${provider}`)
  }
  return provider
}

export function hasCredentialFor(
  provider: ChatProviderId,
  credentials: ChatCredentials,
): boolean {
  if (provider === "openai") return Boolean(credentials.openaiApiKey)
  if (provider === "anthropic") return Boolean(credentials.anthropicApiKey)
  return Boolean(credentials.googleApiKey)
}

export function availableChatModels(credentials: ChatCredentials): ChatModelOption[] {
  return CHAT_MODELS.filter((model) => hasCredentialFor(model.provider, credentials))
}
