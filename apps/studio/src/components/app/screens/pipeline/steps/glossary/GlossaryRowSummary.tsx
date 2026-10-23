import { PenLine, Sparkles } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MutedLabel } from "../shared/list/MutedLabel"
import { MUTED_MEDIA, MUTED_PRIMARY } from "../shared/ui"
import type { GlossaryRow } from "./glossaryRows"

export function SourceMark({ row, hex }: { row: GlossaryRow; hex: string }) {
  const { t } = useLingui()
  const manual = row.source === "manual"
  const label = manual ? t`Added by you` : t`Written by AI`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} className="grid size-4 place-items-center">
          {manual ? (
            <PenLine aria-hidden className="size-3.5 text-muted-foreground" />
          ) : (
            <Sparkles aria-hidden className="size-3.5" style={{ color: hex }} />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function GlossaryRowSummary({ row, hex }: { row: GlossaryRow; hex: string }) {
  const { t } = useLingui()
  const muted = row.pruned === true
  return (
    <span className="grid grid-cols-[16px_minmax(120px,200px)_minmax(0,1fr)] items-center gap-3">
      <SourceMark row={row} hex={hex} />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate text-[13px] font-medium text-foreground", muted && MUTED_PRIMARY)}>{row.word}</span>
        {row.emojis.length > 0 && (
          <>
            <span aria-hidden className={cn("shrink-0 text-[14px] tracking-[2px]", muted && MUTED_MEDIA)}>
              {row.emojis.join("")}
            </span>
            <span className="sr-only">{row.emojis.join(" ")}</span>
          </>
        )}
        {muted && <MutedLabel description={t`Pruned: left out of the book`}>{t`Pruned`}</MutedLabel>}
      </span>
      <span className="truncate text-[12.5px] text-muted-foreground">{row.definition}</span>
    </span>
  )
}
