import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/prompts/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { section: "prompts" } })
  },
})
