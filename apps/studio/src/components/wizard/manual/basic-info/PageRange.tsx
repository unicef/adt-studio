import { useStore } from "@tanstack/react-form"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { RangeSlider } from "@/components/ui/range-slider"
import { getPresetAccent } from "@/components/wizard/core/constants"
import { usePdfField } from "../../core/fields/PdfField"
import { t } from "@lingui/core/macro"

export function PageRange() {
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const startPage = useStore(form.store, (s) => s.values.startPage)
  const endPage = useStore(form.store, (s) => s.values.endPage)
  const selectedPreset = useStore(form.store, (s) => s.values.selectedPreset)
  const { totalPages } = usePdfField()
  const accent = getPresetAccent(selectedPreset)

  const disabled = !file || totalPages === 0
  const start = parseInt(startPage) || 1
  const end = parseInt(endPage) || totalPages || 1

  return (
    <RangeSlider
      label={t`Page Range`}
      tooltip={t`In case you don't want to convert the whole book, adjust the sliders to define which pages will be digitized.`}
      min={1}
      max={totalPages || 1}
      startLabel={t`Initial Page`}
      endLabel={t`Final Page`}
      value={[start, end]}
      onChange={([s, e]) => {
        form.setFieldValue("startPage", String(s))
        form.setFieldValue("endPage", String(e))
      }}
      disabled={disabled}
      color={accent.bg}
    />
  )
}
