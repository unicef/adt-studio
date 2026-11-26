import { lazy, Suspense } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { NoProviderGate } from "@/components/app/NoProviderGate"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { GuidedFlow } from "@/components/wizard/auto/guided"

// Dev builds only: `/books/new?lab` opens the Add Book variant lab. In a production build
// `import.meta.env.DEV` is false, so the lab and its saved answers are left out of the bundle.
const AddBookLab = import.meta.env.DEV ? lazy(() => import("@/components/wizard/auto/lab/AddBookLab")) : null
const inLab = () => AddBookLab !== null && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("lab")

function AddBookPage() {
  if (AddBookLab && inLab())
    return (
      <NoProviderGate>
        <Suspense fallback={null}>
          <AddBookLab />
        </Suspense>
      </NoProviderGate>
    )
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
