import { useCallback } from "react"
import { safeParseModelId } from "@adt/types"
import { useProviderCredentials } from "./use-provider-credentials"
import { resolveEffectiveDefaultModel, useEffectiveDefaultModel } from "./use-effective-default-model"
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
 * Same check, plus whether it can be trusted yet. `ready` is false while the
 * provider list or the book's config is still loading, and when either failed
 * to load (a failed config would fall back to the global default model and
 * misjudge a book set to another provider); UI that announces a missing
 * provider should wait for it so users with a key never see a false "no
 * provider".
 */
export function useBookStructuredTextStatus(bookLabel: string): { available: boolean; ready: boolean } {
  const { isAvailable, isLoading, error } = useProviderCredentials()
  const config = useActiveConfig(bookLabel)
  const effectiveModel = resolveEffectiveDefaultModel(config.data)
  return {
    available: isAvailable("structured-text", effectiveModel),
    ready: !isLoading && !error && !config.isLoading && !config.error,
  }
}

/**
 * True once the provider list has loaded and no provider can run text steps
 * on the global default model. False while loading or on a failed load, so
 * prompts asking the user to connect a provider never flash.
 */
export function useNeedsTextProvider(): boolean {
  const { isAvailable, isLoading, error } = useProviderCredentials()
  return !isLoading && !error && !isAvailable("structured-text")
}

/**
 * Speech availability resolved against the book's `speech.default_provider` —
 * the provider a Speech run of this book synthesizes with — instead of the
 * global default the bare `hasSpeechProvider` flag checks. Without this, a
 * book switched to Gemini keeps its Run buttons disabled when only a Gemini
 * key is configured. Prefer this in any component with a book in scope.
 */
export function useBookSpeechAvailability(bookLabel: string): boolean {
  const { isAvailable } = useProviderCredentials()
  const speech = useActiveConfig(bookLabel).data?.merged?.speech as
    | { default_provider?: unknown }
    | undefined
  const provider =
    typeof speech?.default_provider === "string" && speech.default_provider.trim()
      ? speech.default_provider.trim()
      : "openai" // the speech stage's own fallback
  // eslint-disable-next-line lingui/no-unlocalized-strings -- qualified model identifier, never rendered
  return isAvailable("tts", `${provider}:default`)
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
