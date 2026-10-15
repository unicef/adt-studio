import { Trans } from "@lingui/react/macro"
import { ArrowRight, ChevronRight, Plus } from "lucide-react"
import { getStageDescriptionI18n, getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { Status } from "./parts"
import { StepArt } from "./StepArt"
import { useStepFacts } from "./stepFacts"
import { SKIN } from "./style"

export interface StepDetailProps {
  item: DockItem
  group: string
  here: boolean
  inBook: boolean
  notice: string | undefined
  wide?: boolean
  onAction?: () => void
}

const chipClassName = "flex h-6 items-center gap-1.5 rounded-full px-2 text-[11.5px] whitespace-nowrap"

function StatusLine({ item, here, inBook, notice }: Pick<StepDetailProps, "item" | "here" | "inBook" | "notice">) {
  if (notice) return <span className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">{notice}</span>
  if (here)
    return (
      <span className="text-[11.5px] font-medium" style={{ color: item.hex }}>
        <Trans>You're here</Trans>
      </span>
    )
  if (inBook) return <Status item={item} />
  return (
    <span className={cn("text-[11.5px]", SKIN.muted)}>
      <Trans>Not in the book yet</Trans>
    </span>
  )
}

function Art({ item, className }: { item: DockItem; className?: string }) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-[14px] p-2", className)}
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${item.hex} 14%, transparent), color-mix(in srgb, ${item.hex} 4%, transparent))` }}
    >
      <StepArt slug={item.slug} hex={item.hex} />
      <span
        className="absolute top-2 left-2 grid size-7 place-items-center rounded-[9px] bg-white shadow-[0_2px_6px_-2px_rgba(15,23,42,0.25)] dark:bg-zinc-900"
      >
        <item.icon className="size-3.5" strokeWidth={2} style={{ color: item.hex }} />
      </span>
    </div>
  )
}

export function StepDetail({ item, group, here, inBook, notice, wide = false, onAction }: StepDetailProps) {
  const facts = useStepFacts()(item.slug)
  const description = getStageDescriptionI18n(item.slug)
  const name = getStageLabelI18n(item.slug)

  const info = (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className={cn("truncate text-[14px] font-semibold tracking-[-0.01em]", SKIN.strong)}>{name}</span>
          <span className={cn("truncate text-[11.5px]", SKIN.muted)}>{group}</span>
        </div>
      </div>
      {description && <p className={cn("mt-1.5 text-[12.5px] leading-snug", SKIN.muted)}>{description}</p>}
      {facts.facts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {facts.facts.map((fact) => (
            <span key={fact.text} className={cn(chipClassName, "bg-zinc-950/[0.045] text-zinc-700 dark:bg-white/[0.07] dark:text-white/75")}>
              <fact.icon className="size-3.5 shrink-0" strokeWidth={1.9} style={{ color: item.hex }} />
              {fact.text}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 rounded-[12px] bg-zinc-950/[0.03] p-2.5 dark:bg-white/[0.05]">
        <p className={cn("text-[10.5px] font-semibold uppercase tracking-[0.08em]", SKIN.muted)}>
          <Trans>Where it fits</Trans>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className={cn(chipClassName, "bg-white text-zinc-600 ring-1 ring-zinc-950/[0.07] dark:bg-zinc-900 dark:text-white/65 dark:ring-white/[0.08]")}>
            {facts.before}
          </span>
          <ChevronRight className={cn("size-3 shrink-0", SKIN.muted)} strokeWidth={2.25} />
          <span
            className={cn(chipClassName, "font-semibold text-white")}
            style={{ background: item.hex }}
          >
            <item.icon className="size-3 shrink-0" strokeWidth={2.2} />
            {name}
          </span>
          {facts.after && (
            <>
              <ChevronRight className={cn("size-3 shrink-0", SKIN.muted)} strokeWidth={2.25} />
              <span className={cn(chipClassName, "bg-white text-zinc-600 ring-1 ring-zinc-950/[0.07] dark:bg-zinc-900 dark:text-white/65 dark:ring-white/[0.08]")}>
                {facts.after}
              </span>
            </>
          )}
        </div>
        <p className={cn("mt-1.5 text-[11.5px] leading-snug", SKIN.muted)}>{facts.fit}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusLine item={item} here={here} inBook={inBook} notice={notice} />
        {!here && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold transition-[background-color,scale] duration-150 ease-out active:scale-[0.97]",
              inBook
                ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                : "bg-brand-600 text-white hover:bg-brand-700",
            )}
          >
            {inBook ? (
              <>
                <Trans>Open</Trans>
                <ArrowRight className="size-3.5" strokeWidth={2.25} />
              </>
            ) : (
              <>
                <Plus className="size-3.5" strokeWidth={2.5} />
                <Trans>Add to book</Trans>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )

  if (wide) {
    return (
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 p-1">
        <Art item={item} className="h-full min-h-[170px]" />
        {info}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Art item={item} className="h-[96px]" />
      {info}
    </div>
  )
}
