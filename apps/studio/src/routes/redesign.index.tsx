import { createFileRoute } from "@tanstack/react-router"
import { HomeScreen } from "@/components/redesign/screens/HomeScreen"

export const Route = createFileRoute("/redesign/")({
  component: HomeScreen,
})
