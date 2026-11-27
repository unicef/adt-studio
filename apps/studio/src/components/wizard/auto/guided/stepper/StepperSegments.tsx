import { useLingui } from "@lingui/react/macro"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LABEL, OpenAgain, stepStates, type StepperProps } from "./shared"

/**
 * Bars: four segments across the column, each filling as its step is done. Reading pulses while
 * the book is read; Check fills screen by screen. The name sits under each bar.
 */
export function StepperSegments(props: StepperProps) {
  const { t } = useLingui()
  const { locked, onGo, checkProgress = 0 } = props
  return (
    <nav aria-label={t`Add Book steps`}>
      <ol className="grid grid-cols-4 gap-2 sm:gap-3">
        {stepStates(props).map((s) => {
          const fill = s.done ? 1 : !s.current ? 0 : s.step === "check" ? Math.max(0.12, checkProgress) : s.step === "upload" ? 1 : 0.55
          return (
            <li key={s.step}>
              <button type="button" onClick={() => onGo(s.step)} disabled={!s.canGo} aria-current={s.onScreen ? "step" : undefined} className={cn("group flex w-full flex-col gap-2 rounded-lg py-1 text-left disabled:cursor-default", s.canGo && "hover:opacity-80")}>
                <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-border/80">
                  <span
                    style={{ width: `${fill * 100}%` }}
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", s.bad ? "bg-destructive" : "bg-[var(--gd-step)]", s.current && !s.done && s.step === "reading" && !s.bad && "animate-pulse motion-reduce:animate-none")}
                  />
                </span>
                <span className={cn("flex items-center gap-1.5 text-[13.5px] lg:text-[14.5px]", s.onScreen ? "font-semibold text-foreground" : s.done ? "text-foreground/75" : "text-muted-foreground", !s.onScreen && "max-sm:sr-only")}>
                  {s.bad ? <X className="size-3.5 stroke-[3] text-destructive" /> : s.done ? <Check className="size-3.5 stroke-[3] text-[var(--gd-step-ink)]" /> : null}
                  {LABEL[s.step]}
                  <OpenAgain s={s} locked={locked} />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
