import { createFileRoute } from "@tanstack/react-router"
import { NotificationsSection } from "@/components/app/screens/settings/NotificationsSection"

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationsSection,
})
