import { createFileRoute } from "@tanstack/react-router"
import { LibraryScreen } from "@/components/redesign/screens/LibraryScreen"

export const Route = createFileRoute("/redesign/library")({
  component: LibraryScreen,
})
