import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/books/$label/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/books/$label/$step",
      params: { label: params.label, step: "book" },
    })
  },
  component: () => null,
})
