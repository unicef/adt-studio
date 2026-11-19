import { createFileRoute } from "@tanstack/react-router"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { ModelsSection } from "@/components/app/screens/settings/ModelsSection"

function ModelsSettingsRoute() {
  return (
    <FloatingSaveProvider>
      <ModelsSection />
    </FloatingSaveProvider>
  )
}

export const Route = createFileRoute("/_app/settings/models")({
  component: ModelsSettingsRoute,
})
