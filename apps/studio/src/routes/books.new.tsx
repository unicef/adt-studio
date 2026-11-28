import { createFileRoute } from "@tanstack/react-router"
import { NoProviderGate } from "@/components/app/NoProviderGate"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { AddBookFlow } from "@/components/wizard/AddBookFlow"

function AddBookPage() {
  return (
    <NoProviderGate>
      <WizardProvider>
        <WizardFormProvider>
          <AddBookFlow />
        </WizardFormProvider>
      </WizardProvider>
    </NoProviderGate>
  )
}

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})
