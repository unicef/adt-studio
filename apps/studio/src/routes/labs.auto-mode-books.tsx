import { createFileRoute } from "@tanstack/react-router"
import { useLingui } from "@lingui/react/macro"
import { WizardProvider } from "@/components/wizard"
import { WizardFormProvider } from "@/components/wizard/WizardFormProvider"
import { BookGallery } from "@/components/wizard/autoModePrototype/bookGallery/BookGallery"
import { usePageTitle } from "@/hooks/use-page-title"

export const Route = createFileRoute("/labs/auto-mode-books")({
  component: BookGalleryPage,
})

function BookGalleryPage() {
  const { t } = useLingui()
  usePageTitle(t`Cover gallery`)
  return (
    <WizardProvider>
      <WizardFormProvider>
        <BookGallery />
      </WizardFormProvider>
    </WizardProvider>
  )
}
