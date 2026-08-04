import { RenderStrategyPicker } from "./RenderStrategyPicker"
import { PageGroupingMode } from "./PageGroupingMode"
import { SectioningMode } from "./SectioningMode"
import { REFLOWABLE_FONTS } from "@adt/types"
import { useWizardForm } from "../wizardForm"
import { useStore } from "@tanstack/react-form"
import { Trans } from "@lingui/react/macro"

function OutputFontPicker() {
  const form = useWizardForm()
  const value = useStore(form.store, (state) => state.values.reflowableFont)

  return (
    <section className="space-y-2" aria-labelledby="output-font-heading">
      <div>
        <h3 id="output-font-heading" className="text-sm font-semibold text-[#171717]">
          <Trans>Output font family</Trans>
        </h3>
        <p className="text-xs text-[#737373]">
          <Trans>Use one accessible font throughout generated, reflowable pages. You can change it later from the book toolbar.</Trans>
        </p>
      </div>
      <select
        value={value}
        onChange={(event) => form.setFieldValue("reflowableFont", event.target.value as typeof value)}
        className="h-10 w-full rounded-md border border-[#d4d4d4] bg-white px-3 text-sm text-[#171717] focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
      >
        <option value="auto"><Trans>Automatic — match the book</Trans></option>
        {REFLOWABLE_FONTS.map((font) => <option key={font.id} value={font.id}>{font.family}</option>)}
      </select>
      <p className="text-xs text-[#737373]">
        <Trans>Commercial fonts such as Sassoon must also be installed or attached to the book for an exact match.</Trans>
      </p>
    </section>
  )
}

export function Step2() {
  return (
    <div className="flex flex-col gap-6 p-8">
      <RenderStrategyPicker />
      <OutputFontPicker />
      <PageGroupingMode />
      <SectioningMode />
    </div>
  )
}
