import { createFileRoute } from "@tanstack/react-router"
import { AppearanceSection } from "@/components/redesign/screens/settings/AppearanceSection"

export const Route = createFileRoute("/redesign/settings/theme")({
  component: AppearanceSection,
})
