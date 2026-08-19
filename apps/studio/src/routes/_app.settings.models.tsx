import { createFileRoute } from "@tanstack/react-router"
import { ModelsSection } from "@/components/app/screens/settings/ModelsSection"

export const Route = createFileRoute("/_app/settings/models")({
  component: ModelsSection,
})
