import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/books/$label/pages/$pageId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/books/$label/storyboard",
      params: { label: params.label },
      search: { page: params.pageId },
    })
  },
  component: () => null,
})
