import { Check, PenLine } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { StepFilterTabs } from "../../shared/StepFilterTabs"
import type { GlossaryFilter } from "../glossaryList"

export function GlossaryFiltersInline({
  counts,
  filter,
  onFilter,
  mineOnly,
  onMineOnly,
  hex,
}: {
  counts: { active: number; pruned: number; all: number; mine: number }
  filter: GlossaryFilter
  onFilter: (value: GlossaryFilter) => void
  mineOnly: boolean
  onMineOnly: (value: boolean) => void
  hex: string
}) {
  const { t } = useLingui()
  return (
    <>
      <StepFilterTabs
        ariaLabel={t`Show terms`}
        accent={hex}
        value={filter}
        onChange={onFilter}
        options={[
          { value: "active", label: t`Active`, count: counts.active },
          { value: "pruned", label: t`Pruned`, count: counts.pruned },
          { value: "all", label: t`All`, count: counts.all },
        ]}
      />
      <button
        type="button"
        aria-pressed={mineOnly}
        disabled={counts.mine === 0}
        onClick={() => onMineOnly(!mineOnly)}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:text-muted-foreground",
          mineOnly ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
        )}
      >
        {mineOnly ? <Check className="size-3" /> : <PenLine className="size-3" />}
        {t`Added by you`}
        <span className="font-mono text-[11px] tabular-nums">{counts.mine}</span>
      </button>
    </>
  )
}
