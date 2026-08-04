import { createFileRoute } from "@tanstack/react-router"
import { SettingsLayout } from "@/components/redesign/screens/settings/SettingsLayout"

export const Route = createFileRoute("/redesign/settings")({
  component: SettingsLayout,
})
