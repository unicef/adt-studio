import { createFileRoute } from "@tanstack/react-router"
import { HandoffsScreen } from "@/components/app/screens/HandoffsScreen"

export const Route = createFileRoute("/_app/handoffs")({
  component: HandoffsScreen,
})
