import { createFileRoute, redirect } from "@tanstack/react-router"
import { SETTINGS_PATHS } from "@/components/app/screens/settings/nav"

export const Route = createFileRoute("/_app/settings/")({
  beforeLoad: () => {
    throw redirect({ to: SETTINGS_PATHS.language, replace: true })
  },
})
