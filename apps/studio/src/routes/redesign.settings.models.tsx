import { createFileRoute } from "@tanstack/react-router"
import { ModelsSection } from "@/components/redesign/screens/settings/ModelsSection"

export const Route = createFileRoute("/redesign/settings/models")({
  component: ModelsSection,
})
