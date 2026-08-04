import { createFileRoute } from "@tanstack/react-router"
import { AboutSection } from "@/components/redesign/screens/settings/AboutSection"

export const Route = createFileRoute("/redesign/settings/about")({
  component: AboutSection,
})
