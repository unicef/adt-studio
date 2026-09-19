import { useCallback } from "react"
import { safeParseModelId } from "@adt/types"
import { useProviderCredentials } from "./use-provider-credentials"
import { useEffectiveDefaultModel } from "./use-effective-default-model"
import { useActiveConfig } from "./use-debug"

/**
 * Structured-text availability resolved against the book's effective default
 * model — the model a run of this book actually uses — instead of the global
 * default the bare `hasStructuredTextProvider` flag checks. Prefer this in any
 * component with a book in scope.
 */
export function useBookStructuredTextAvailability(bookLabel: string): boolean {
  const { isAvailable } = useProviderCredentials()
  const effectiveModel = useEffectiveDefaultModel(bookLabel)
  return isAvailable("structured-text", effectiveModel)
}

/**
 * Agent availability resolved against the model an agent run of this book
 * actually uses. Mirrors agents-service's chain: the merged config's
 * `agents.model` (a documented per-book override), else the default model's
 * provider's declared agent default, else the server-advertised default.
 * Prefer this in any component with a book in scope, or agent features vanish
 * for books that run agents on a non-default provider.
 */
export function useBookAgentAvailability(bookLabel: string): boolean {
  const { providers, isAvailable } = useProviderCredentials()
  const merged = useActiveConfig(bookLabel).data?.merged
  const agents = merged?.agents as { model?: unknown } | undefined
  const explicit =
    typeof agents?.model === "string" && agents.model.trim() ? agents.model : undefined
  const model = explicit ?? agentModelForDefaultModel(merged?.default_model, providers)
  return isAvailable("agent", model)
}

/** The agent model a book's default model implies — same provider, its declared agent default. */
function agentModelForDefaultModel(
  defaultModel: unknown,
  providers: ReturnType<typeof useProviderCredentials>["providers"],
): string | undefined {
  if (typeof defaultModel !== "string" || !defaultModel.trim()) return undefined
  const parsed = safeParseModelId(defaultModel)
  if (!parsed.ok) return undefined
  const manifest = providers.find(
    ({ manifest }) => manifest.id === parsed.value.providerId,
  )?.manifest
  const agentDefault = manifest?.defaultModels?.agent
  if (!manifest?.modalities.includes("agent") || !agentDefault) return undefined
  return `${manifest.id}:${agentDefault}`
}

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
  const elevenLabsKey = value("elevenlabs", "apiKey")

  const setApiKey = useCallback((next: string) => set("openai", "apiKey", next), [set])
  const setAnthropicKey = useCallback((next: string) => set("anthropic", "apiKey", next), [set])
  const setGoogleKey = useCallback((next: string) => set("google", "apiKey", next), [set])
  const setCustomBaseUrl = useCallback((next: string) => set("custom", "baseUrl", next), [set])
  const setCustomApiKey = useCallback((next: string) => set("custom", "apiKey", next), [set])
  const setAzureKey = useCallback((next: string) => set("azure", "apiKey", next), [set])
  const setAzureRegion = useCallback((next: string) => set("azure", "region", next), [set])
  const setGeminiKey = useCallback((next: string) => set("gemini", "apiKey", next), [set])
  const setElevenLabsKey = useCallback(
    (next: string) => set("elevenlabs", "apiKey", next),
    [set],
  )
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
    hasApiKey: apiKey.length > 0,
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
    elevenLabsKey,
    setElevenLabsKey,
    hasElevenLabsKey: elevenLabsKey.length > 0,
  }
}
