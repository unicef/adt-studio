import { useLingui } from "@lingui/react/macro"
import { ValidationFixStage } from "@adt/types"
import { STAGES } from "@/components/pipeline/stage-config"
import { STAGE_LABEL_MESSAGES } from "@/components/pipeline/pipeline-i18n"

/** A navigation-only override. It never changes checklist or review metadata. */
export function ValidationDestinationSelect({ value, onChange }: {
  value: ValidationFixStage
  onChange: (value: ValidationFixStage) => void
}) {
  const { t, i18n } = useLingui()
  return (
    <select className="rounded-md border bg-background px-2 py-1 text-xs"
      aria-label={t`Fix destination`} value={value}
      onChange={(event) => onChange(ValidationFixStage.parse(event.target.value))}>
      {STAGES.filter((stage) => ValidationFixStage.safeParse(stage.slug).success).map((stage) => (
        <option key={stage.slug} value={stage.slug}>{i18n._(STAGE_LABEL_MESSAGES[stage.slug])}</option>
      ))}
    </select>
  )
}
