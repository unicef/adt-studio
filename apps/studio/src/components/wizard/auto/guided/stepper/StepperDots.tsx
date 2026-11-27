import { Fragment } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LABEL, OpenAgain, stepStates, type StepperProps } from "./shared"

/**
 * Upload · Reading · Check · Create. The steps already done are the history: each one opens again
 * (unless the book is being created). The step on screen carries the dot; `failed` marks the
 * current one when something went wrong there, and `complete` ticks them all once the book is made.
 * On Check, `checkBars` takes the dot's place: one small bar per screen of Check.
 */
export function StepperDots(props: StepperProps) {
  const { at, locked, onGo, checkBars } = props
  const { t } = useLingui()
  const atIndex = stepStates(props).findIndex((s) => s.step === at)
  return (
    <nav aria-label={t`Add Book steps`}>
      <ol className="flex items-center">
        {stepStates(props).map((s) => {
          const { step, i, done, current, onScreen, canGo, bad } = s
          return (
            <Fragment key={step}>
              {i > 0 && <li aria-hidden className={cn("gd-line mx-2 h-px min-w-6 flex-1", i <= atIndex ? "bg-[var(--gd-step)]" : "bg-border")} />}
              <li className="relative flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => onGo(step)}
                  disabled={!canGo}
                  aria-current={onScreen ? "step" : undefined}
                  className={cn("group flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[14px] transition-colors lg:text-[15.5px] duration-200 disabled:cursor-default", !onScreen && "max-sm:pr-1", canGo && "hover:bg-[var(--lc-bubble)]", onScreen ? "font-semibold text-foreground" : done ? "text-foreground/80" : "text-muted-foreground")}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-300",
                      bad ? "bg-destructive text-white" : done ? "bg-[var(--gd-step)] text-primary-foreground" : current ? "bg-[var(--lc-bubble)] text-[var(--gd-step-ink)] shadow-[inset_0_0_0_1.5px_var(--gd-step)]" : "bg-[var(--lc-bubble)] text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]",
                    )}
                  >
                    {bad ? <X className="size-3.5 stroke-[3]" /> : done ? <Check className="size-3.5 stroke-[3]" /> : i + 1}
                  </span>
                  {/* On a phone only the step on screen keeps its name, so the four fit. */}
                  <span className={cn(!onScreen && "max-sm:sr-only")}>{LABEL[step]}</span>
                  <OpenAgain s={s} locked={locked} />
                </button>
                {step === "check" && onScreen && checkBars ? (
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2" style={{ viewTransitionName: "gd-step-dot" }}>
                    {checkBars}
                  </span>
                ) : (
                  <span aria-hidden style={onScreen ? { viewTransitionName: "gd-step-dot" } : undefined} className={cn("gd-dot absolute -bottom-2.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full", onScreen ? (bad ? "bg-destructive" : "bg-[var(--gd-step)]") : "scale-0 opacity-0")} />
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
