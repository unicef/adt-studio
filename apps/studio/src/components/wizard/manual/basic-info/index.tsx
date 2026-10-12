import { useBooks } from "@/hooks/use-books"
import { useWizardForm } from "../../core/wizardForm"
import { PresetViewer } from "./PresetViewer"
import { PdfField } from "../../core/fields/PdfField"
import { Scope } from "./Scope"
import { ProjectNameField } from "../../core/fields/ProjectNameField"
import { createProjectLabelSchema } from "../../core/fields/projectLabelSchema"

export function Step1() {
  const form = useWizardForm()
  const { data: books } = useBooks()
  const existingLabels = books?.map((b: { label: string }) => b.label) ?? []

  return (
    <div className="flex flex-col gap-6 p-8">
      <PresetViewer />
      <PdfField />

      <form.Field
        name="label"
        validators={{
          onChange: createProjectLabelSchema(existingLabels),
        }}
      >
        {(field) => (
          <ProjectNameField
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>

      <Scope />
    </div>
  )
}
