import { createFileRoute } from "@tanstack/react-router"
import { ReviewScreen } from "@/components/redesign/screens/review/ReviewScreen"

export const Route = createFileRoute("/redesign-review")({
  component: ReviewScreen,
})
