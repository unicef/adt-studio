import { createFileRoute } from "@tanstack/react-router"
import { UpdateDialogsPreview } from "@/components/updates/UpdateDialogsPreview"

export const Route = createFileRoute("/dev-update-flow")({
  component: UpdateDialogsPreview,
})
