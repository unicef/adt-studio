import { createFileRoute } from "@tanstack/react-router"
import { PublishingSettings } from "@/components/settings/publishing/PublishingSettings"

export const Route = createFileRoute("/_app/settings/publishing")({
  component: PublishingSettings,
})
