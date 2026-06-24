import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { LanguagePicker } from "@/components/LanguagePicker"
import { normalizeLocale } from "@/lib/languages"

const EDITING_LANGUAGE_LABEL = msg`Editing Language`
const EDITING_LANGUAGE_HINT = msg`Leave empty to use the book language.`

const OUTPUT_LANGUAGES_LABEL = msg`Output Languages`
const OUTPUT_LANGUAGES_HINT = msg`Leave empty to output only in the book language.`

export function Step4() {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const editingLanguage = useStore(form.store, (s) => s.values.editingLanguage)
  const outputLanguages = useStore(form.store, (s) => s.values.outputLanguages)

  const outputSet = new Set(outputLanguages.map(normalizeLocale))

  function toggleOutputLanguage(code: string) {
    const normalized = normalizeLocale(code)
    const next = outputSet.has(normalized)
      ? outputLanguages.filter((l) => normalizeLocale(l) !== normalized)
      : [...outputLanguages, code]
    form.setFieldValue("outputLanguages", next)
  }

  return (
    <div className="flex w-full flex-col gap-5 p-8">
      <LanguagePicker
        label={i18n._(EDITING_LANGUAGE_LABEL)}
        hint={i18n._(EDITING_LANGUAGE_HINT)}
        selected={editingLanguage}
        onSelect={(code) => form.setFieldValue("editingLanguage", code)}
        size="default"
      />

      <LanguagePicker
        label={i18n._(OUTPUT_LANGUAGES_LABEL)}
        hint={i18n._(OUTPUT_LANGUAGES_HINT)}
        selected={outputSet}
        onSelect={toggleOutputLanguage}
        multiple
        size="default"
      />
    </div>
  )
}
