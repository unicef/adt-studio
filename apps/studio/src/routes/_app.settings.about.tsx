import { createFileRoute } from "@tanstack/react-router"
import { AboutSection } from "@/components/app/screens/settings/AboutSection"

export const Route = createFileRoute("/_app/settings/about")({
  component: AboutSection,
})
