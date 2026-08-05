import { createFileRoute } from "@tanstack/react-router"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { PromptsSection } from "@/components/redesign/screens/settings/PromptsSection"

function PromptsSettingsRoute() {
  return (
    <FloatingSaveProvider>
      <PromptsSection />
    </FloatingSaveProvider>
  )
}

export const Route = createFileRoute("/redesign/settings/prompts")({
  component: PromptsSettingsRoute,
})
