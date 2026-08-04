import { createFileRoute } from "@tanstack/react-router"
import { SettingsScreen } from "@/components/redesign/screens/SettingsScreen"

export const Route = createFileRoute("/redesign/settings")({
  component: SettingsScreen,
})
