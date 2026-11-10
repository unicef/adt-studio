import type { ReactNode } from "react"
import { EyeOff, RotateCcw, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { GlossaryRow } from "./glossaryRows"

const ACTION =
  "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

function Tip({ tip, children }: { tip: ReactNode; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-60 text-pretty">{tip}</TooltipContent>
    </Tooltip>
  )
}

export function TermStateButton({
  row,
  locked,
  onPrune,
  onRemove,
}: {
  row: GlossaryRow
  locked: boolean
  onPrune: (pruned: boolean) => void
  onRemove: () => void
}) {
  const { t } = useLingui()
  if (row.source === "manual")
    return (
      <Tip tip={<Trans>Remove this term you added</Trans>}>
        <button type="button" disabled={locked} onClick={onRemove} aria-label={t`Remove ${row.word}`} className={`${ACTION} text-destructive hover:bg-destructive/10`}>
          <Trash2 className="size-3.5" />
        </button>
      </Tip>
    )
  if (row.pruned)
    return (
      <Tip tip={<Trans>Back in the book. Future runs may pick it again.</Trans>}>
        <button type="button" disabled={locked} onClick={() => onPrune(false)} aria-label={t`Restore ${row.word}`} className={`${ACTION} text-foreground hover:bg-muted`}>
          <RotateCcw className="size-3.5" />
          <Trans>Restore</Trans>
        </button>
      </Tip>
    )
  return (
    <Tip tip={<Trans>Prune: leave it out of the book and out of future runs</Trans>}>
      <button
        type="button"
        disabled={locked}
        onClick={() => onPrune(true)}
        aria-label={t`Prune ${row.word}`}
        className={`${ACTION} text-muted-foreground hover:bg-muted hover:text-foreground`}
      >
        <EyeOff className="size-3.5" />
      </button>
    </Tip>
  )
}
