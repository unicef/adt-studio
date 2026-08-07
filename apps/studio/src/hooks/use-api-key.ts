import { useState, useCallback } from "react"

const STORAGE_KEY_OPENAI = "adt-studio-openai-key"
const STORAGE_KEY_ANTHROPIC = "adt-studio-anthropic-key"
const STORAGE_KEY_GOOGLE = "adt-studio-google-key"
const STORAGE_KEY_CUSTOM_BASE_URL = "adt-studio-custom-base-url"
const STORAGE_KEY_CUSTOM_API_KEY = "adt-studio-custom-api-key"
const STORAGE_KEY_AZURE = "adt-studio-azure-key"
const STORAGE_KEY_AZURE_REGION = "adt-studio-azure-region"
const STORAGE_KEY_GEMINI = "adt-studio-gemini-key"
const STORAGE_KEY_ELEVENLABS = "adt-studio-elevenlabs-key"

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
    },
    [key]
  )

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
  const [elevenLabsKey, setElevenLabsKey] = useLocalStorageState(STORAGE_KEY_ELEVENLABS)

  return {
    apiKey,
    setApiKey,
    hasApiKey: apiKey.length > 0,
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
