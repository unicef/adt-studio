import { useCallback } from "react"
import { useProviderCredentials } from "./use-provider-credentials"

/**
 * Hook to manage API keys in localStorage.
 */
export function useApiKey() {
  const providerState = useProviderCredentials()
  const value = providerState.credentialValue
  const set = providerState.setCredential

  /* eslint-disable lingui/no-unlocalized-strings -- compatibility aliases use canonical provider/field identifiers */
  const apiKey = value("openai", "apiKey")
  const anthropicKey = value("anthropic", "apiKey")
  const googleKey = value("google", "apiKey")
  const customBaseUrl = value("custom", "baseUrl")
  const customApiKey = value("custom", "apiKey")
  const azureKey = value("azure", "apiKey")
  const azureRegion = value("azure", "region")
  const geminiKey = value("gemini", "apiKey")

  const setApiKey = useCallback((next: string) => set("openai", "apiKey", next), [set])
  const setAnthropicKey = useCallback((next: string) => set("anthropic", "apiKey", next), [set])
  const setGoogleKey = useCallback((next: string) => set("google", "apiKey", next), [set])
  const setCustomBaseUrl = useCallback((next: string) => set("custom", "baseUrl", next), [set])
  const setCustomApiKey = useCallback((next: string) => set("custom", "apiKey", next), [set])
  const setAzureKey = useCallback((next: string) => set("azure", "apiKey", next), [set])
  const setAzureRegion = useCallback((next: string) => set("azure", "region", next), [set])
  const setGeminiKey = useCallback((next: string) => set("gemini", "apiKey", next), [set])
  /* eslint-enable lingui/no-unlocalized-strings */

  const hasStructuredTextProvider = providerState.isAvailable("structured-text")
  const hasAgentProvider = providerState.isAvailable("agent")
  const hasImageProvider = providerState.isAvailable("image")
  const hasSpeechProvider = providerState.isAvailable("tts")
  const hasTranscriber = providerState.isAvailable("stt")

  return {
    ...providerState,
    apiKey,
    setApiKey,
    /** @deprecated Prefer the modality-specific availability flags. */
    hasStructuredTextProvider,
    hasAgentProvider,
    hasImageProvider,
    hasSpeechProvider,
    hasTranscriber,
    anthropicKey,
    setAnthropicKey,
    hasAnthropicKey: anthropicKey.length > 0,
    googleKey,
    setGoogleKey,
    hasGoogleKey: googleKey.length > 0,
    customBaseUrl,
    setCustomBaseUrl,
    customApiKey,
    setCustomApiKey,
    hasCustomProvider: customBaseUrl.length > 0,
    azureKey,
    setAzureKey,
    hasAzureKey: azureKey.length > 0,
    azureRegion,
    setAzureRegion,
    geminiKey,
    setGeminiKey,
    hasGeminiKey: geminiKey.length > 0,
  }
}
