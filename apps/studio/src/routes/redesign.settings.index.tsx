import { createFileRoute, redirect } from "@tanstack/react-router"
import { SETTINGS_PATHS } from "@/components/redesign/screens/settings/nav"

export const Route = createFileRoute("/redesign/settings/")({
  beforeLoad: () => {
    throw redirect({ to: SETTINGS_PATHS.language, replace: true })
  },
})
