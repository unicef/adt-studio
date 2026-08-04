import { createFileRoute } from "@tanstack/react-router"
import { LanguageSection } from "@/components/redesign/screens/settings/LanguageSection"

export const Route = createFileRoute("/redesign/settings/language")({
  component: LanguageSection,
})
