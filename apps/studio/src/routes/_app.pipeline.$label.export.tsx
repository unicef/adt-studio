import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { ExportScreen } from "@/components/app/screens/pipeline/export/ExportScreen"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { getVariant } from "@/components/app/lab/variants"

export const Route = createFileRoute("/_app/pipeline/$label/export")({
  beforeLoad: ({ params }) => {
    if (getVariant("export") === "current") {
      throw redirect({ to: "/pipeline/$label", params: { label: params.label }, replace: true })
    }
  },
  component: ExportRoute,
})

function ExportRoute() {
  const { label } = Route.useParams()
  const router = useRouter()
  const nav = usePipelineNavigation(label)
  return (
    <ExportScreen
      label={label}
      onBack={() => (router.history.canGoBack() ? router.history.back() : nav.openWorkspace())}
    />
  )
}
