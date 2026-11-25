import { createFileRoute } from "@tanstack/react-router"
import { ReaderSourceSection } from "@/components/app/screens/settings/ReaderSourceSection"

export const Route = createFileRoute("/_app/settings/reader")({
  component: ReaderSourceSection,
})
