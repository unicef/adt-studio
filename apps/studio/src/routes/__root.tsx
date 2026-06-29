import { useState, createContext, useContext, useCallback, useMemo } from "react"
import {
  createRootRoute,
  Outlet,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog"
import { Toaster } from "@/components/ui/sonner"
import { UpdateDialogProvider } from "@/components/updates"
import { useApiKey } from "@/hooks/use-api-key"
import { ErrorScreen } from "@/components/ErrorScreen"

const SettingsContext = createContext<{ openSettings: () => void }>({
  openSettings: () => {},
})

export function useSettingsDialog() {
  return useContext(SettingsContext)
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  return <ErrorScreen variant="app" error={error} reset={reset} />
}

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorComponent,
})

function RootLayout() {
  const {
    apiKey,
    setApiKey,
    hasApiKey,
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
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isOnboarding = pathname.startsWith("/onboarding")
  const [showKeyDialog, setShowKeyDialog] = useState(!hasApiKey && !isOnboarding)
  const openSettings = useCallback(() => setShowKeyDialog(true), [])
  // Google and Gemini TTS use the same API key — save to both storage keys
  const saveGoogleKey = useMemo(() => (key: string) => { setGoogleKey(key); setGeminiKey(key) }, [setGoogleKey, setGeminiKey])

  return (
    <SettingsContext value={{ openSettings }}>
      <UpdateDialogProvider>
        <div className="flex flex-col h-screen bg-background text-foreground">
          <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Outlet />
          </main>

          <ApiKeyDialog
            open={showKeyDialog}
            onOpenChange={setShowKeyDialog}
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
          <Toaster position="top-center" richColors closeButton />
        </div>
      </UpdateDialogProvider>
    </SettingsContext>
  )
}
