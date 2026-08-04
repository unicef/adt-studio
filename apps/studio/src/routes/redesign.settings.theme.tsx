import { createFileRoute } from "@tanstack/react-router"
import { ThemeSection } from "@/components/redesign/screens/settings/ThemeSection"

export const Route = createFileRoute("/redesign/settings/theme")({
  component: ThemeSection,
})
