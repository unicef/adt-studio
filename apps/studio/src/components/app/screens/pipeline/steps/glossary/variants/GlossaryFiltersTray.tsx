import { useLingui } from "@lingui/react/macro"
import { StepFilterTabs } from "../../shared/StepFilterTabs"

export function GlossaryFiltersTray({
  counts,
  mineOnly,
  onMineOnly,
  hex,
}: {
  counts: { active: number; mine: number }
  mineOnly: boolean
  onMineOnly: (value: boolean) => void
  hex: string
}) {
  const { t } = useLingui()
  return (
    <StepFilterTabs
      ariaLabel={t`Show terms`}
      accent={hex}
      value={mineOnly ? "mine" : "all"}
      onChange={(value) => onMineOnly(value === "mine")}
      options={[
        { value: "all", label: t`All`, count: counts.active },
        { value: "mine", label: t`Added by you`, count: counts.mine },
      ]}
    />
  )
}
