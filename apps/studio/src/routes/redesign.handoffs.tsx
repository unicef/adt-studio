import { createFileRoute } from "@tanstack/react-router"
import { HandoffsScreen } from "@/components/redesign/screens/HandoffsScreen"

export const Route = createFileRoute("/redesign/handoffs")({
  component: HandoffsScreen,
})
