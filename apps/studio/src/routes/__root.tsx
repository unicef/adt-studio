import { useState } from "react"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog"
import { useApiKey } from "@/hooks/use-api-key"

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

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex items-center justify-end px-3 py-1 border-b">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowKeyDialog(true)}
          title="API Key Settings"
        >
          <Settings className="h-4 w-4" />
          <span className="sr-only">API Key Settings</span>
        </Button>
      </div>

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
  )
}
