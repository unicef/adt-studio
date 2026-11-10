import { useLingui } from "@lingui/react/macro"
import { StepFilterTabs } from "../../shared/StepFilterTabs"
import type { GlossaryFilter } from "../glossaryList"

type TrayTab = "all" | "mine" | "pruned"

export function GlossaryFiltersTray({
  counts,
  filter,
  onFilter,
  mineOnly,
  onMineOnly,
  hex,
}: {
  counts: { all: number; pruned: number; mine: number }
  filter: GlossaryFilter
  onFilter: (value: GlossaryFilter) => void
  mineOnly: boolean
  onMineOnly: (value: boolean) => void
  hex: string
}) {
  const { t } = useLingui()
  const value: TrayTab = mineOnly ? "mine" : filter === "pruned" ? "pruned" : "all"
  return (
    <StepFilterTabs<TrayTab>
      ariaLabel={t`Show terms`}
      accent={hex}
      value={value}
      onChange={(next) => {
        onMineOnly(next === "mine")
        onFilter(next === "pruned" ? "pruned" : "active")
      }}
      options={[
        { value: "all", label: t`All`, count: counts.all },
        { value: "mine", label: t`Added by you`, count: counts.mine },
        { value: "pruned", label: t`Pruned`, count: counts.pruned },
      ]}
    />
  )
}
