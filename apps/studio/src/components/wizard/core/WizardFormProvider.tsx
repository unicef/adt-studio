import type { ReactNode } from "react"
import { useAppForm, defaultWizardValues } from "./wizardForm"

export function WizardFormProvider({ children }: { children: ReactNode }) {
  const form = useAppForm({ defaultValues: defaultWizardValues })
  return <form.AppForm>{children}</form.AppForm>
}
