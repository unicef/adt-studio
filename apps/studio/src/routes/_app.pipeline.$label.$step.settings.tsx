import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/pipeline/$label/$step/settings")({
  component: Outlet,
})
