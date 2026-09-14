import { createContext, useCallback, useContext } from "react"
import {
  createRootRoute,
  Outlet,
  useNavigate,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { AppToaster } from "@/components/AppToaster"
import { ErrorScreen } from "@/components/ErrorScreen"
import type { SettingsSection } from "@/components/settings/settingsSections"
import { UpdateDialogProvider } from "@/components/updates"

const SettingsContext = createContext<{
  openSettings: (section?: SettingsSection) => void
}>({
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
  const navigate = useNavigate()
  const openSettings = useCallback(
    (section: SettingsSection = "default-model") => {
      if (section === "api-keys") void navigate({ to: "/settings/providers" })
      else if (section === "prompts") void navigate({ to: "/settings/prompts" })
      else void navigate({ to: "/settings/models" })
    },
    [navigate],
  )

  return (
    <SettingsContext value={{ openSettings }}>
      <UpdateDialogProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
          <AppToaster />
        </div>
      </UpdateDialogProvider>
    </SettingsContext>
  )
}
