import { createFileRoute } from "@tanstack/react-router"
import { NoProviderGate } from "@/components/app/NoProviderGate"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { GuidedFlow } from "@/components/wizard/auto/guided"

function AddBookPage() {
  return (
    <NoProviderGate>
      <WizardProvider>
        <WizardFormProvider>
          <GuidedFlow />
        </WizardFormProvider>
      </WizardProvider>
    </NoProviderGate>
  )
}

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})
