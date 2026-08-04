import { createFileRoute } from "@tanstack/react-router"
import { RedesignLayout } from "@/components/redesign/RedesignLayout"

export const Route = createFileRoute("/redesign")({
  component: RedesignLayout,
})
