import { createFileRoute } from "@tanstack/react-router"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { PromptsSection } from "@/components/app/screens/settings/PromptsSection"

function PromptsSettingsRoute() {
  return (
    <FloatingSaveProvider>
      <PromptsSection />
    </FloatingSaveProvider>
  )
}

export const Route = createFileRoute("/_app/settings/prompts")({
  component: PromptsSettingsRoute,
})
