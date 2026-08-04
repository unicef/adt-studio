import { createFileRoute } from "@tanstack/react-router"
import { NotificationsSection } from "@/components/redesign/screens/settings/NotificationsSection"

export const Route = createFileRoute("/redesign/settings/notifications")({
  component: NotificationsSection,
})
