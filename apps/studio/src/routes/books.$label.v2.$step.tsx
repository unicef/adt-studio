import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/books/$label/v2/$step")({
  component: StepLayout,
})

function StepLayout() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Outlet />
    </div>
  )
}
