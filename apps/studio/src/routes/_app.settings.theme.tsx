import { createFileRoute } from "@tanstack/react-router"
import { AppearanceSection } from "@/components/app/screens/settings/AppearanceSection"

export const Route = createFileRoute("/_app/settings/theme")({
  component: AppearanceSection,
})
