import { useState, useCallback } from "react"

const STORAGE_KEY_OPENAI = "adt-studio-openai-key"
const STORAGE_KEY_AZURE = "adt-studio-azure-key"
const STORAGE_KEY_AZURE_REGION = "adt-studio-azure-region"

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
  const [azureKey, setAzureKey] = useLocalStorageState(STORAGE_KEY_AZURE)
  const [azureRegion, setAzureRegion] = useLocalStorageState(STORAGE_KEY_AZURE_REGION)

  return {
    apiKey,
    setApiKey,
    hasApiKey: apiKey.length > 0,
    azureKey,
    setAzureKey,
    hasAzureKey: azureKey.length > 0,
    azureRegion,
    setAzureRegion,
  }
}
