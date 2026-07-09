import { createFileRoute } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { StudioTopBar } from "@/components/StudioTopBar"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { GlobalPromptsSettings } from "@/components/pipeline/stages/book/GlobalPromptsSettings"
import { usePageTitle } from "@/hooks/use-page-title"

export const Route = createFileRoute("/prompts/settings")({
  component: PromptSettingsPage,
})

function PromptSettingsPage() {
  const { t } = useLingui()
  usePageTitle(t`Prompt Settings`)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StudioTopBar brandLinksHome trailingTitle={<Trans>Prompt Settings</Trans>} />
      <FloatingSaveProvider>
        <GlobalPromptsSettings />
      </FloatingSaveProvider>
    </div>
  )
}
