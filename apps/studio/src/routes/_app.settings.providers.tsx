import { createFileRoute } from "@tanstack/react-router"
import { ProvidersSection } from "@/components/app/screens/settings/ProvidersSection"
import { parseProviderAuthSearch } from "@/components/app/screens/settings/provider-anchor"

export const Route = createFileRoute("/_app/settings/providers")({
  component: ProvidersSection,
  validateSearch: parseProviderAuthSearch,
})
