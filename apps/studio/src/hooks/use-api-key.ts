import { useState, useCallback, useEffect } from "react"

const STORAGE_KEY_OPENAI = "adt-studio-openai-key"
const STORAGE_KEY_ANTHROPIC = "adt-studio-anthropic-key"
const STORAGE_KEY_GOOGLE = "adt-studio-google-key"
const STORAGE_KEY_CUSTOM_BASE_URL = "adt-studio-custom-base-url"
const STORAGE_KEY_CUSTOM_API_KEY = "adt-studio-custom-api-key"
const STORAGE_KEY_AZURE = "adt-studio-azure-key"
const STORAGE_KEY_AZURE_REGION = "adt-studio-azure-region"
const STORAGE_KEY_GEMINI = "adt-studio-gemini-key"
const STORAGE_KEY_OPENAI_MODEL = "adt-studio-openai-default-model"
const STORAGE_KEY_ANTHROPIC_MODEL = "adt-studio-anthropic-default-model"
const STORAGE_KEY_GOOGLE_MODEL = "adt-studio-google-default-model"
const STORAGE_KEY_CUSTOM_MODEL = "adt-studio-custom-default-model"
const API_SETTING_CHANGED_EVENT = "adt:api-setting-changed"
const ACTIVE_PROVIDER_STORAGE_KEY = "adt-studio-active-provider"

function hasValue(value: string): boolean {
  return value.trim().length > 0
}

function isConfiguredOpenAIKey(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.startsWith("sk-")
}

function useLocalStorageState(key: string) {
  const [value, setValueState] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? ""
    } catch {
      return ""
    }
  })

  const setValue = useCallback(
    (v: string) => {
      setValueState(v)
      try {
        if (v) localStorage.setItem(key, v)
        else localStorage.removeItem(key)
      } catch {
        // localStorage unavailable
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(API_SETTING_CHANGED_EVENT, {
          detail: { key, value: v },
        }))
      }
    },
    [key]
  )

  useEffect(() => {
    const syncValue = (nextValue: string | null) => setValueState(nextValue ?? "")
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) syncValue(event.newValue)
    }
    const onLocalChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; value?: string }>).detail
      if (detail?.key === key) syncValue(detail.value ?? null)
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(API_SETTING_CHANGED_EVENT, onLocalChange)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(API_SETTING_CHANGED_EVENT, onLocalChange)
    }
  }, [key])

  return [value, setValue] as const
}

/**
 * Hook to manage API keys in localStorage.
 */
export function useApiKey() {
  const [apiKey, setApiKey] = useLocalStorageState(STORAGE_KEY_OPENAI)
  const [anthropicKey, setAnthropicKey] = useLocalStorageState(STORAGE_KEY_ANTHROPIC)
  const [googleKey, setGoogleKey] = useLocalStorageState(STORAGE_KEY_GOOGLE)
  const [customBaseUrl, setCustomBaseUrl] = useLocalStorageState(STORAGE_KEY_CUSTOM_BASE_URL)
  const [customApiKey, setCustomApiKey] = useLocalStorageState(STORAGE_KEY_CUSTOM_API_KEY)
  const [azureKey, setAzureKey] = useLocalStorageState(STORAGE_KEY_AZURE)
  const [azureRegion, setAzureRegion] = useLocalStorageState(STORAGE_KEY_AZURE_REGION)
  const [geminiKey, setGeminiKey] = useLocalStorageState(STORAGE_KEY_GEMINI)
  const [openaiDefaultModel, setOpenaiDefaultModel] = useLocalStorageState(STORAGE_KEY_OPENAI_MODEL)
  const [anthropicDefaultModel, setAnthropicDefaultModel] = useLocalStorageState(STORAGE_KEY_ANTHROPIC_MODEL)
  const [googleDefaultModel, setGoogleDefaultModel] = useLocalStorageState(STORAGE_KEY_GOOGLE_MODEL)
  const [customDefaultModel, setCustomDefaultModel] = useLocalStorageState(STORAGE_KEY_CUSTOM_MODEL)

  const hasOpenAIKey = isConfiguredOpenAIKey(apiKey)
  const hasAnthropicKey = hasValue(anthropicKey)
  const hasGoogleKey = hasValue(googleKey)
  const hasCustomProvider = hasValue(customBaseUrl)
  const hasApiKey = hasOpenAIKey || hasAnthropicKey || hasGoogleKey || hasCustomProvider

  // Read the user's active provider choice reactively
  const [activeProviderChoice] = useLocalStorageState(ACTIVE_PROVIDER_STORAGE_KEY)

  // Resolve default model: prefer the active provider's model, then fall back to priority order
  const defaultModel = (() => {
    const models: Record<string, string> = {
      openai: openaiDefaultModel || "openai:gpt-5.4",
      anthropic: anthropicDefaultModel || "anthropic:claude-sonnet-4-6",
      google: googleDefaultModel || "google:gemini-2.5-pro",
      custom: customDefaultModel || "custom:your-model-name",
    }
    const configured: Record<string, boolean> = {
      openai: hasOpenAIKey,
      anthropic: hasAnthropicKey,
      google: hasGoogleKey,
      custom: hasCustomProvider,
    }
    // If user explicitly chose a provider and it's still configured, use its model
    if (activeProviderChoice && configured[activeProviderChoice]) {
      return models[activeProviderChoice]
    }
    // Fall back to priority order
    for (const p of ["openai", "anthropic", "google", "custom"]) {
      if (configured[p]) return models[p]
    }
    return null
  })()

  return {
    apiKey,
    setApiKey,
    hasApiKey,
    hasOpenAIKey,
    defaultModel,
    providerDefaultModels: {
      openai: openaiDefaultModel || "openai:gpt-5.4",
      anthropic: anthropicDefaultModel || "anthropic:claude-sonnet-4-6",
      google: googleDefaultModel || "google:gemini-2.5-pro",
      custom: customDefaultModel || "custom:your-model-name",
    },
    setProviderDefaultModel: (provider: "openai" | "anthropic" | "google" | "custom", model: string) => {
      if (provider === "openai") setOpenaiDefaultModel(model)
      else if (provider === "anthropic") setAnthropicDefaultModel(model)
      else if (provider === "google") setGoogleDefaultModel(model)
      else setCustomDefaultModel(model)
    },
    anthropicKey,
    setAnthropicKey,
    hasAnthropicKey,
    googleKey,
    setGoogleKey,
    hasGoogleKey,
    customBaseUrl,
    setCustomBaseUrl,
    customApiKey,
    setCustomApiKey,
    hasCustomProvider,
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
