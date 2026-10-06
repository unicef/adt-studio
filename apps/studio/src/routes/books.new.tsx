import { createFileRoute } from "@tanstack/react-router"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { AddBookFlow } from "@/components/wizard/AddBookFlow"

function AddBookPage() {
  return (
    <WizardProvider>
      <WizardFormProvider>
        <AddBookFlow />
      </WizardFormProvider>
    </WizardProvider>
  )
}

export const Route = createFileRoute("/books/new")({
  component: AddBookPage,
})
