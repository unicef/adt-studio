import { createFileRoute } from "@tanstack/react-router"
import { LibraryScreen } from "@/components/app/screens/library/LibraryScreen"

export const Route = createFileRoute("/_app/library")({
  component: LibraryScreen,
})
