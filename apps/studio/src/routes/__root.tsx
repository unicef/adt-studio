import { useState, createContext, useContext, useCallback } from "react"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog"
import { useApiKey } from "@/hooks/use-api-key"

const SettingsContext = createContext<{ openSettings: () => void }>({
  openSettings: () => {},
})

export function useSettingsDialog() {
  return useContext(SettingsContext)
}

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const {
    apiKey,
    setApiKey,
    hasApiKey,
    azureKey,
    setAzureKey,
    azureRegion,
    setAzureRegion,
  } = useApiKey()
  const [showKeyDialog, setShowKeyDialog] = useState(!hasApiKey)
  const openSettings = useCallback(() => setShowKeyDialog(true), [])

  return (
    <SettingsContext value={{ openSettings }}>
      <div className="flex flex-col h-screen bg-background text-foreground">
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>

        <ApiKeyDialog
          open={showKeyDialog}
          onOpenChange={setShowKeyDialog}
          apiKey={apiKey}
          onSaveApiKey={setApiKey}
          azureKey={azureKey}
          onSaveAzureKey={setAzureKey}
          azureRegion={azureRegion}
          onSaveAzureRegion={setAzureRegion}
        />
      </div>
    </SettingsContext>
  )
}
