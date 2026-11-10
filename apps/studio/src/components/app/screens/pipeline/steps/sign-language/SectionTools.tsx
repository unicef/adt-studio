import type { CSSProperties, ReactNode } from "react"
import { CheckCircle2, ChevronRight, ListTree, Loader2, Plus, Upload } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { SectionEntry } from "@/components/pipeline/stages/sign-language/components/types"

const TILE = "grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--sl-hex)_14%,transparent)] text-[var(--sl-hex)]"
const CARD_BUTTON = cn(
  "group flex min-h-[58px] w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
  "transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-out motion-reduce:transition-none",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--sl-hex)_45%,transparent)]",
)

export interface SectionToolsProps {
  hex: string
  covered: number
  total: number
  nextMissing: SectionEntry | null
  nextUploading: boolean
  canUpload: boolean
  uploadReason: ReactNode
  onAddNext: (sectionId: string) => void
  onManage: () => void
}

export function SectionTools({ hex, covered, total, nextMissing, nextUploading, canUpload, uploadReason, onAddNext, onManage }: SectionToolsProps) {
  const { t } = useLingui()
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0

  const next = nextMissing ? (
    <button
      type="button"
      onClick={canUpload ? () => onAddNext(nextMissing.sectionId) : undefined}
      aria-disabled={!canUpload || undefined}
      className={cn(
        CARD_BUTTON,
        "border-[color-mix(in_srgb,var(--sl-hex)_30%,transparent)] bg-[color-mix(in_srgb,var(--sl-hex)_6%,var(--card))]",
        "hover:border-[color-mix(in_srgb,var(--sl-hex)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--sl-hex)_11%,var(--card))]",
        "aria-disabled:cursor-default aria-disabled:opacity-55 aria-disabled:hover:border-[color-mix(in_srgb,var(--sl-hex)_30%,transparent)] aria-disabled:hover:bg-[color-mix(in_srgb,var(--sl-hex)_6%,var(--card))]",
      )}
    >
      <span className={TILE}>{nextUploading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Upload className="size-4" />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          <Trans>Next missing</Trans>
        </span>
        <span className="truncate text-[13px] font-semibold text-foreground">{nextMissing.sectionLabel}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--sl-hex)]">
        <Plus className="size-3.5 transition-transform duration-200 ease-out group-hover:rotate-90 group-aria-disabled:rotate-0 motion-reduce:transition-none" strokeWidth={2.4} />
        <Trans>Add video</Trans>
      </span>
    </button>
  ) : (
    <div className={cn(CARD_BUTTON, "border-[color-mix(in_srgb,var(--sl-hex)_30%,transparent)] bg-[color-mix(in_srgb,var(--sl-hex)_6%,var(--card))]")}>
      <span className={TILE}>
        <CheckCircle2 className="size-4" strokeWidth={2.25} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11.5px] font-medium text-muted-foreground">
          <Trans>All set</Trans>
        </span>
        <span className="truncate text-[13px] font-semibold text-foreground">
          <Trans>Every section has a video</Trans>
        </span>
      </span>
    </div>
  )

  return (
    <section
      aria-label={t`Sections`}
      style={{ ["--sl-hex" as string]: hex } as CSSProperties}
      className="@container rounded-xl border bg-card p-1.5 animate-in fade-in duration-300 motion-reduce:animate-none"
    >
      <div className="grid gap-1.5 @[700px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]">
        <div className="flex min-h-[58px] flex-col justify-center gap-2 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-foreground">
              <Trans>Coverage</Trans>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {t`${covered} of ${plural(total, { one: "# section", other: "# sections" })}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t`Sections with a video`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={covered}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--sl-hex)_16%,transparent)]"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--sl-hex)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {nextMissing && !canUpload && uploadReason ? (
          <Tooltip>
            <TooltipTrigger asChild>{next}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="max-w-[260px] text-[11.5px] leading-snug">
              {uploadReason}
            </TooltipContent>
          </Tooltip>
        ) : (
          next
        )}

        <button type="button" onClick={onManage} className={cn(CARD_BUTTON, "bg-card hover:border-[color-mix(in_srgb,var(--sl-hex)_40%,transparent)] hover:bg-muted/50")}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
            <ListTree className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold text-foreground">
              <Trans>Manage sections</Trans>
            </span>
            <span className="truncate text-[11.5px] text-muted-foreground">
              <Trans>Missing, covered or all</Trans>
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </button>
      </div>
    </section>
  )
}
