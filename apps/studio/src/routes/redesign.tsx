import { createFileRoute } from "@tanstack/react-router"
import { RedesignShell } from "@/components/redesign/RedesignShell"

export const Route = createFileRoute("/redesign")({
  component: RedesignShell,
})
