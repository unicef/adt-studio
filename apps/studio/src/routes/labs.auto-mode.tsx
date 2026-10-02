import { createFileRoute } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { WizardProvider } from "@/components/wizard"
import { WizardFormProvider } from "@/components/wizard/WizardFormProvider"
import { AutoModePrototype, type ProtoStep } from "@/components/wizard/autoModePrototype/AutoModePrototype"

const STEPS: ProtoStep[] = ["upload", "choose", "loader", "decide", "review", "create", "opened", "manual"]
import { usePageTitle } from "@/hooks/use-page-title"

export const Route = createFileRoute("/labs/auto-mode")({
  validateSearch: (search: Record<string, unknown>): { mock?: string; step?: ProtoStep } => ({
    ...(typeof search.mock === "string" && search.mock ? { mock: search.mock } : {}),
    ...(typeof search.step === "string" && (STEPS as string[]).includes(search.step) ? { step: search.step as ProtoStep } : {}),
  }),
  component: AutoModePrototypePage,
})

function AutoModePrototypePage() {
  const { t } = useLingui()
  usePageTitle(t`Auto mode prototype`)
  const { mock, step } = Route.useSearch()
  return (
    <WizardProvider>
      <WizardFormProvider>
        <AutoModePrototype mock={mock} step={step} />
      </WizardFormProvider>
    </WizardProvider>
  )
}
