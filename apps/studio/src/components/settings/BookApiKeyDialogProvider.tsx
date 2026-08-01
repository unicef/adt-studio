import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useApiKey } from "@/hooks/use-api-key"
import { ApiKeyDialog } from "./ApiKeyDialog"

type BookApiKeyDialogContextValue = {
  openApiKeyDialog: () => void
}

const BookApiKeyDialogContext = createContext<BookApiKeyDialogContextValue>({
  openApiKeyDialog: () => {},
})

export function useBookApiKeyDialog() {
  return useContext(BookApiKeyDialogContext)
}

export function BookApiKeyDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const {
    apiKey,
    setApiKey,
    anthropicKey,
    setAnthropicKey,
    googleKey,
    setGoogleKey,
    customBaseUrl,
    setCustomBaseUrl,
    customApiKey,
    setCustomApiKey,
    azureKey,
    setAzureKey,
    azureRegion,
    setAzureRegion,
    setGeminiKey,
  } = useApiKey()

  const openApiKeyDialog = useCallback(() => setOpen(true), [])
  const saveGoogleKey = useCallback(
    (key: string) => {
      setGoogleKey(key)
      setGeminiKey(key)
    },
    [setGeminiKey, setGoogleKey],
  )
  const contextValue = useMemo(
    () => ({ openApiKeyDialog }),
    [openApiKeyDialog],
  )

  return (
    <BookApiKeyDialogContext value={contextValue}>
      {children}
      <ApiKeyDialog
        open={open}
        onOpenChange={setOpen}
        apiKey={apiKey}
        onSaveApiKey={setApiKey}
        anthropicKey={anthropicKey}
        onSaveAnthropicKey={setAnthropicKey}
        googleKey={googleKey}
        onSaveGoogleKey={saveGoogleKey}
        customBaseUrl={customBaseUrl}
        onSaveCustomBaseUrl={setCustomBaseUrl}
        customApiKey={customApiKey}
        onSaveCustomApiKey={setCustomApiKey}
        azureKey={azureKey}
        onSaveAzureKey={setAzureKey}
        azureRegion={azureRegion}
        onSaveAzureRegion={setAzureRegion}
      />
    </BookApiKeyDialogContext>
  )
}
