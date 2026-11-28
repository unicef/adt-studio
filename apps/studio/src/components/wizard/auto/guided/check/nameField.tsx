import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"
import { ProjectNameField } from "@/components/wizard/core/fields/ProjectNameField"
import { createProjectLabelSchema, PROJECT_NAME_INPUT_ID } from "@/components/wizard/core/fields/projectLabelSchema"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { useBooks } from "@/hooks/use-books"

/** The real wizard's Project Name field, with the same validation (unique, slug-safe), as the book's name. Enter sets the book up. */
export function NameField({ onEnter }: { onEnter?: () => void }) {
  const form = useWizardForm()
  const { data: books } = useBooks()
  const existing = books?.map((b: { label: string }) => b.label) ?? []
  return (
    <form.Field name="label" validators={{ onChange: createProjectLabelSchema(existing) }}>
      {(field) => <ProjectNameField value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} label={<Trans>Book name</Trans>} onEnter={onEnter} hint={<Trans>The name of this book in your library. Use letters, numbers, dots, dashes and underscores, with no spaces.</Trans>} />}
    </form.Field>
  )
}

/** Whether the book can be created (a valid, unique Project Name); `create` focuses the name field when it can't. */
export function useCreate(onCreate: () => void) {
  const form = useWizardForm()
  const { data: books } = useBooks()
  const label = useStore(form.store, (s) => s.values.label)
  const ok = createProjectLabelSchema(books?.map((b: { label: string }) => b.label) ?? []).safeParse(label).success
  return () => {
    if (ok) onCreate()
    else document.getElementById(PROJECT_NAME_INPUT_ID)?.focus()
  }
}
