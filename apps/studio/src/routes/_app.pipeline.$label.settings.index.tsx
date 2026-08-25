import { createFileRoute, redirect } from "@tanstack/react-router"
import { DEFAULT_BOOK_SETTINGS_SECTION } from "@/components/app/screens/pipeline/book-settings/sections"

export const Route = createFileRoute("/_app/pipeline/$label/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/pipeline/$label/settings/$section",
      params: { label: params.label, section: DEFAULT_BOOK_SETTINGS_SECTION },
      replace: true,
    })
  },
})
