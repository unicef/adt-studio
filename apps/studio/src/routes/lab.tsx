import { createFileRoute, redirect } from "@tanstack/react-router"
import { LAB_ENABLED } from "@/components/app/lab/variants"
import { HAS_CANVAS, LabCanvasRoute } from "@/components/app/lab/LabCanvasRoute"

export const Route = createFileRoute("/lab")({
  beforeLoad: () => {
    if (!LAB_ENABLED || !HAS_CANVAS) throw redirect({ to: "/" })
  },
  component: LabCanvasRoute,
})
