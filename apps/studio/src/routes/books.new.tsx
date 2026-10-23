import { createFileRoute } from "@tanstack/react-router"
import { NoProviderGate } from "@/components/app/NoProviderGate"
import { WizardProvider } from "@/components/wizard"
import { WizardFormProvider } from "@/components/wizard/WizardFormProvider"
import { BookCreationWizard } from "@/components/wizard/BookCreationWizard"

function AddBookPage() {
  return (
    <NoProviderGate>
      <WizardProvider>
        <WizardFormProvider>
          <BookCreationWizard />
        </WizardFormProvider>
      </WizardProvider>
    </NoProviderGate>
  )
}

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})
