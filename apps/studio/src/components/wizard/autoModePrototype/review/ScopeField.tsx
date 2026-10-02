import { useId, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { BookOpen, Scissors, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { RangeSlider } from "@/components/ui/range-slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getPresetAccent } from "@/components/wizard/constants"
import { usePdfField } from "@/components/wizard/step1BasicInfo/PdfField"
import { useWizardForm, type WizardFormValues } from "@/components/wizard/wizardForm"

type Scope = WizardFormValues["scope"]

const RANGE_LABEL = msg`Page Range`
const RANGE_TOOLTIP = msg`In case you don't want to convert the whole book, adjust the sliders to define which pages will be digitized.`
const START_LABEL = msg`Initial Page`
const END_LABEL = msg`Final Page`

/** The wizard's page-range slider (same logic and copy as step 1), in the flow's blue accent rather than the preset's. */
function BluePageRange() {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const file = useStore(form.store, (s) => s.values.file)
  const startPage = useStore(form.store, (s) => s.values.startPage)
  const endPage = useStore(form.store, (s) => s.values.endPage)
  const { totalPages } = usePdfField()
  const start = parseInt(startPage) || 1
  const end = parseInt(endPage) || totalPages || 1
  return (
    <RangeSlider
      label={i18n._(RANGE_LABEL)}
      tooltip={i18n._(RANGE_TOOLTIP)}
      min={1}
      max={totalPages || 1}
      startLabel={i18n._(START_LABEL)}
      endLabel={i18n._(END_LABEL)}
      value={[start, end]}
      onChange={([a, b]) => {
        form.setFieldValue("startPage", String(a))
        form.setFieldValue("endPage", String(b))
      }}
      disabled={!file || totalPages === 0}
      color={getPresetAccent(null).bg}
    />
  )
}

/**
 * How much of the book to process, as a select with the wizard's own options (step 1 "Scope"):
 * Whole book, Page range or Split into parts. Page range reveals the page-range slider (in blue);
 * Split explains what happens after the book is created.
 */
export function ScopeField() {
  const id = useId()
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const options: { value: Scope; icon: LucideIcon; title: ReactNode; hint: ReactNode }[] = [
    { value: "whole", icon: BookOpen, title: <Trans>Whole book</Trans>, hint: <Trans>Process every page on this machine.</Trans> },
    { value: "range", icon: SlidersHorizontal, title: <Trans>Page range</Trans>, hint: <Trans>Process only a range of pages here.</Trans> },
    { value: "split", icon: Scissors, title: <Trans>Split into parts</Trans>, hint: <Trans>Hand out page-range parts and merge them back later.</Trans> },
  ]
  const current = options.find((o) => o.value === scope) ?? options[0]

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        <Trans>How much of this book do you want to process?</Trans>
      </label>
      <Select value={scope} onValueChange={(v) => form.setFieldValue("scope", v as Scope)}>
        <SelectTrigger id={id} className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => {
            const Icon = o.icon
            return (
              <SelectItem key={o.value} value={o.value}>
                <span className="inline-flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  {o.title}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      <p className="text-xs leading-relaxed text-muted-foreground">{current.hint}</p>

      <Collapsible shown={scope === "range"}>
        <div className="pt-1">
          <BluePageRange />
        </div>
      </Collapsible>
      <Collapsible shown={scope === "split"}>
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <Trans>Extraction is skipped now. After the book is created, use the Split & merge panel on its overview to export page-range parts and merge the completed results back.</Trans>
        </p>
      </Collapsible>
    </div>
  )
}
