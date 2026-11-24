import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ChevronLeft, ChevronRight, Hourglass } from "lucide-react"
import { Collapsible } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { viewOf } from "../model"

/** Previous / next pages, and where the book is open. */
export function PageNav({ page, numPages, single, onStep, className }: { page: number; numPages: number; single: boolean; onStep: (dir: 1 | -1) => void; className?: string }) {
  const { t } = useLingui()
  const shown = viewOf(page, numPages, single).filter((n): n is number => n !== null)
  const first = shown[0] ?? 1
  const last = shown[shown.length - 1] ?? first
  const button = "grid size-9 place-items-center rounded-full bg-muted text-foreground transition-[background-color,transform,opacity] hover:bg-muted/70 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button type="button" className={button} onClick={() => onStep(-1)} disabled={first <= 1} aria-label={single ? t`Previous page` : t`Previous pages`}>
        <ChevronLeft className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-[132px] text-center text-[13px] font-medium tabular-nums text-muted-foreground">
        {numPages > 0 ? (
          first === last ? (
            <Trans>
              Page {first} of {numPages}
            </Trans>
          ) : (
            <Trans>
              Pages {first}–{last} of {numPages}
            </Trans>
          )
        ) : (
          " "
        )}
      </span>
      <button type="button" className={button} onClick={() => onStep(1)} disabled={numPages === 0 || last >= numPages} aria-label={single ? t`Next page` : t`Next pages`}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

/** The calm note when the answer is slow, with the way out. */
export function SlowNote({ shown, onManual }: { shown: boolean; onManual: () => void }) {
  return (
    <Collapsible shown={shown}>
      <p inert={!shown} className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl bg-muted px-3.5 py-2 text-center text-[13px] text-muted-foreground">
        <Hourglass aria-hidden className="size-3.5" />
        <Trans>This is taking longer than usual. You can wait, or</Trans>
        <button type="button" onClick={onManual} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-800">
          <Trans>set it up myself</Trans>
        </button>
      </p>
    </Collapsible>
  )
}

export function TextButton({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex h-11 items-center rounded-full px-4 text-[14px] font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/10", className)}>
      {children}
    </button>
  )
}

/**
 * The bar along the bottom: back (or Cancel while reading), the manual setup, which is always
 * there, and the step's one primary action.
 */
export function ActionBar({ backLabel, onBack, onManual, primary }: { backLabel?: ReactNode; onBack: () => void; onManual: () => void; primary?: ReactNode }) {
  const { t } = useLingui()
  return (
    <div data-fade className="sticky bottom-0 z-30 -mx-4 mt-auto border-t bg-background/85 px-4 py-3 backdrop-blur transition-opacity duration-300 sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-[1360px] items-center gap-1 sm:gap-2">
        {backLabel ? (
          <button type="button" onClick={onBack} className="inline-flex h-11 items-center rounded-full bg-muted px-4 text-[14px] font-medium transition-colors hover:bg-muted/70">
            {backLabel}
          </button>
        ) : (
          <button type="button" onClick={onBack} aria-label={t`Back`} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[14px] font-medium transition-[background-color,transform] hover:bg-muted/70 active:scale-[0.97] sm:px-4">
            <ArrowLeft aria-hidden className="size-4" />
            <span className="max-sm:hidden">
              <Trans>Back</Trans>
            </span>
          </button>
        )}
        <div className="flex-1" />
        <TextButton onClick={onManual} className="whitespace-nowrap px-2.5 text-[13.5px] sm:px-4 sm:text-[14px]">
          <Trans>Set it up myself</Trans>
        </TextButton>
        {primary}
      </div>
    </div>
  )
}

