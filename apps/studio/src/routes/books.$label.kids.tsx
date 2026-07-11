import { createFileRoute } from "@tanstack/react-router"
import { KidsModeScreen } from "@/components/kids/KidsModeScreen"

export const Route = createFileRoute("/books/$label/kids")({
  component: KidsPage,
})

function KidsPage() {
  const { label } = Route.useParams()
  return <KidsModeScreen bookLabel={label} />
}
