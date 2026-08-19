import { createFileRoute } from "@tanstack/react-router"
import { LibraryScreen } from "@/components/app/screens/LibraryScreen"

export const Route = createFileRoute("/_app/library")({
  component: LibraryScreen,
})
