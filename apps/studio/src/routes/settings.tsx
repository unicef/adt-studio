import { createFileRoute } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { StudioTopBar } from "@/components/StudioTopBar"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { GlobalPromptsSettings } from "@/components/pipeline/stages/book/GlobalPromptsSettings"
import { ApiKeysSettings } from "@/components/settings/ApiKeysSettings"
import { DefaultModelSettings } from "@/components/settings/DefaultModelSettings"
import { SettingsNavigation } from "@/components/settings/SettingsNavigation"
import {
  normalizeSettingsSection,
  type SettingsSection,
} from "@/components/settings/settingsSections"
import { usePageTitle } from "@/hooks/use-page-title"

type SettingsSearch = {
  section: SettingsSection
}

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    section: normalizeSettingsSection(search.section),
  }),
  component: SettingsPage,
})

export function SettingsPage() {
  const { t } = useLingui()
  const { section } = Route.useSearch()

  usePageTitle(t`Settings`)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StudioTopBar brandLinksHome trailingTitle={<Trans>Settings</Trans>} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SettingsNavigation activeSection={section} />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto" tabIndex={-1}>
          {section === "default-model" && <DefaultModelSettings />}
          {section === "api-keys" && <ApiKeysSettings />}
          {section === "prompts" && (
            <FloatingSaveProvider>
              <GlobalPromptsSettings />
            </FloatingSaveProvider>
          )}
        </main>
      </div>
    </div>
  )
}
