import { createFileRoute } from "@tanstack/react-router"
import { ProvidersSection } from "@/components/app/screens/settings/ProvidersSection"

export const Route = createFileRoute("/_app/settings/providers")({
  component: ProvidersSection,
})
