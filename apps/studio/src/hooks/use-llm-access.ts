import { useApiKey } from "./use-api-key"
import { useEffectiveDefaultModel } from "./use-effective-default-model"

export interface LlmCredentialState {
  apiKey: string
  anthropicKey: string
  googleKey: string
  customBaseUrl: string
}

export function hasCredentialForModel(
  modelId: string,
  credentials: LlmCredentialState,
): boolean {
  const separator = modelId.indexOf(":")
  const provider = separator >= 0 ? modelId.slice(0, separator) : "openai"
  switch (provider) {
    case "local":
    case "ollama":
      return true
    case "anthropic":
      return credentials.anthropicKey.length > 0
    case "google":
      return credentials.googleKey.length > 0
    case "custom":
      return credentials.customBaseUrl.length > 0
    case "openai":
    default:
      return credentials.apiKey.length > 0
  }
}

export function useLlmAccess(bookLabel?: string) {
  const credentials = useApiKey()
  const modelId = useEffectiveDefaultModel(bookLabel)
  return {
    modelId,
    hasLlmAccess: hasCredentialForModel(modelId, credentials),
  }
}
