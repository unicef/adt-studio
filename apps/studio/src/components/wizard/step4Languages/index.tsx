import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { PlayCircle, Scissors } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { LanguagePicker } from "@/components/LanguagePicker"
import { cn } from "@/lib/utils"
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
  const intent = useStore(form.store, (s) => s.values.intent)

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

      <fieldset className="flex flex-col gap-2 border-t border-border/60 pt-5">
        <legend className="mb-1 text-sm font-medium text-foreground">
          <Trans>What's next for this book?</Trans>
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <IntentCard
            selected={intent === "process"}
            onSelect={() => form.setFieldValue("intent", "process")}
            icon={<PlayCircle className="h-4 w-4" />}
            title={<Trans>Process the whole book here</Trans>}
            description={
              <Trans>Start extracting on this machine right after creating the book.</Trans>
            }
          />
          <IntentCard
            selected={intent === "split"}
            onSelect={() => form.setFieldValue("intent", "split")}
            icon={<Scissors className="h-4 w-4" />}
            title={<Trans>Split into parts for others</Trans>}
            description={
              <Trans>Skip extraction — hand out page-range parts and merge the results back later.</Trans>
            }
          />
        </div>
      </fieldset>
    </div>
  )
}

function IntentCard({
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {title}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
    </button>
  )
}
