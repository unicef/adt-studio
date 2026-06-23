import { createFileRoute } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow"
import { usePageTitle } from "@/hooks/use-page-title"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
})

function OnboardingPage() {
  const { t } = useLingui()
  usePageTitle(t`Welcome`)
  return <OnboardingFlow />
}
