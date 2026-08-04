import { createFileRoute } from "@tanstack/react-router"
import { ProvidersSection } from "@/components/redesign/screens/settings/ProvidersSection"

export const Route = createFileRoute("/redesign/settings/providers")({
  component: ProvidersSection,
})
