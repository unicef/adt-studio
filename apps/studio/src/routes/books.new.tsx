import { createFileRoute } from "@tanstack/react-router"
import { WizardProvider } from "@/components/wizard"
import { WizardFormProvider } from "@/components/wizard/WizardFormProvider"
import { AddBookFlow } from "@/components/wizard/autoSetup/AddBookFlow"

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
