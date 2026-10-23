import { Hash, Sparkles } from "lucide-react"
import { Trans } from "@lingui/react/macro"

export function TocModeVisual() {
  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex w-full flex-col gap-1 rounded-md border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-1.5">
            <Hash className="h-2.5 w-2.5 text-amber-700" strokeWidth={2.5} aria-hidden />
            <span className="text-[9px] font-semibold text-amber-900 dark:text-amber-200">
              <Trans>Chapter 1: Introduction</Trans>
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-2.5">
            <Hash className="h-2 w-2 text-amber-600" strokeWidth={2.5} aria-hidden />
            <span className="text-[8.5px] text-amber-800/80 dark:text-amber-300/80">
              <Trans>1.1 Background</Trans>
            </span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
          <Trans>Extract</Trans>
        </span>
      </div>
      <div className="mx-auto h-px w-16 bg-amber-200/60 dark:bg-amber-500/30" aria-hidden />
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex w-full flex-col gap-1 rounded-md border border-amber-200 bg-amber-50/50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-2.5 w-2.5 text-amber-700" strokeWidth={2.5} aria-hidden />
            <span className="text-[9px] font-semibold italic text-amber-900 dark:text-amber-200">
              <Trans>Where it all begins</Trans>
            </span>
          </div>
          <div className="flex items-center gap-1.5 pl-2.5">
            <Sparkles className="h-2 w-2 text-amber-600" strokeWidth={2.5} aria-hidden />
            <span className="text-[8.5px] italic text-amber-800/80 dark:text-amber-300/80">
              <Trans>The world before us</Trans>
            </span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
          <Trans>Dynamic</Trans>
        </span>
      </div>
    </div>
  )
}
