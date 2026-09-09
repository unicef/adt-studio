import { createFileRoute } from "@tanstack/react-router"
import { LanguageSection } from "@/components/app/screens/settings/LanguageSection"

export const Route = createFileRoute("/_app/settings/language")({
  component: LanguageSection,
})
