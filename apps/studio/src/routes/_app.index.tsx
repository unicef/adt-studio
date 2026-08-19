import { createFileRoute } from "@tanstack/react-router"
import { HomeScreen } from "@/components/app/screens/HomeScreen"

export const Route = createFileRoute("/_app/")({
  component: HomeScreen,
})
