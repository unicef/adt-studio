import { Trans } from "@lingui/react/macro"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { NextSuggestion } from "@/components/app/screens/pipeline/shared/contentFlow"

export interface NextStepCardProps {
  next: NextSuggestion
  item: DockItem | undefined
  onOpen: () => void
  onSkip: () => void
}

export function NextStepCard({ next, item, onOpen, onSkip }: NextStepCardProps) {
  return (
    <div
      key={next.key}
      className="flex w-[440px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-[18px] bg-white py-2.5 pr-2.5 pl-3 ring-1 ring-zinc-950/[0.07] shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none dark:bg-zinc-950 dark:ring-white/[0.08]"
    >
      {item && (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-[11px]"
          style={{ background: `color-mix(in srgb, ${item.hex} 12%, transparent)` }}
        >
          <item.icon className="size-[18px]" strokeWidth={1.9} style={{ color: item.hex }} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brand-700 dark:text-brand-300">
          <Trans>Suggested next</Trans>
        </span>
        <span className="truncate text-[13.5px] font-semibold text-zinc-950 dark:text-white">{next.title}</span>
        <span className="truncate text-[12px] text-zinc-500 dark:text-white/55">{next.body}</span>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[12.5px] font-medium text-zinc-500 transition-colors duration-150 hover:bg-zinc-950/[0.05] hover:text-zinc-950 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white"
      >
        <Trans>Not now</Trans>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="h-8 shrink-0 cursor-pointer rounded-lg bg-brand-600 px-3.5 text-[12.5px] font-semibold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-brand-700 active:scale-[0.97]"
      >
        <Trans>Open</Trans>
      </button>
    </div>
  )
}
