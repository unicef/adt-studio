import { createFileRoute } from "@tanstack/react-router"
import { KidsModeScreen } from "@/components/kids/KidsModeScreen"

export const Route = createFileRoute("/books/$label/kids")({
  component: KidsPage,
})

function KidsPage() {
  const { label } = Route.useParams()
  // The book layout's Outlet wrapper is `overflow-hidden`, so each view must
  // own its scroll region (step views get this from StepViewRouter; this
  // standalone route provides it directly). Without it the tall Kids Mode
  // page clips at the fold with no way to scroll.
  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-auto">
      <KidsModeScreen bookLabel={label} />
    </div>
  )
}
