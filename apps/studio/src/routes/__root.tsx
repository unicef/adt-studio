import { createContext, useCallback, useContext } from "react"
import {
  createRootRoute,
  Outlet,
  useNavigate,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { ErrorScreen } from "@/components/ErrorScreen"
import type { SettingsSection } from "@/components/settings/settingsSections"
import { Toaster } from "@/components/ui/sonner"
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
      void navigate({ to: "/settings", search: { section } })
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
          <Toaster position="top-center" richColors closeButton />
        </div>
      </UpdateDialogProvider>
    </SettingsContext>
  )
}
