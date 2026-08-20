import { createFileRoute } from "@tanstack/react-router"
import { BookInfoScreen } from "@/components/app/screens/pipeline/info/BookInfoScreen"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"

export const Route = createFileRoute("/_app/pipeline/$label/info")({
  component: BookInfoRoute,
})

function BookInfoRoute() {
  const { label } = Route.useParams()
  const nav = usePipelineNavigation(label)
  return <BookInfoScreen label={label} onBack={nav.openWorkspace} />
}
