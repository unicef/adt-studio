import { createFileRoute } from "@tanstack/react-router"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { PromptsSection } from "@/components/app/screens/settings/PromptsSection"

function PromptsSettingsRoute() {
  return (
    <FloatingSaveProvider>
      <UnsavedChangesGuard />
      <PromptsSection />
    </FloatingSaveProvider>
  )
}

export const Route = createFileRoute("/_app/settings/prompts")({
  component: PromptsSettingsRoute,
})
