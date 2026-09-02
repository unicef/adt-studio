import { createFileRoute } from "@tanstack/react-router"
import { SettingsLayout } from "@/components/app/screens/settings/SettingsLayout"

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
})
