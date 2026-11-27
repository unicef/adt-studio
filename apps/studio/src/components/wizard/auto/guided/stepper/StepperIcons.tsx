import { Fragment } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ICON, LABEL, OpenAgain, stepStates, type StepperProps } from "./shared"

/**
 * Icons: each step drawn as what happens in it (a PDF going up, a book being read, a checklist,
 * the wand that sets it up), joined by a line that fills as the flow moves on. Names under them.
 */
export function StepperIcons(props: StepperProps) {
  const { t } = useLingui()
  const { locked, onGo, checkBars, at } = props
  const states = stepStates(props)
  const atIndex = states.findIndex((s) => s.step === at)
  return (
    <nav aria-label={t`Add Book steps`}>
      <ol className="flex items-start">
        {states.map((s) => {
          const Icon = ICON[s.step]
          return (
            <Fragment key={s.step}>
              {s.i > 0 && <li aria-hidden className={cn("gd-line mx-1 mt-5 h-0.5 min-w-4 flex-1 rounded-full", s.i <= atIndex ? "bg-[var(--gd-step)]" : "bg-border")} />}
              <li className="flex flex-col items-center">
                <button type="button" onClick={() => onGo(s.step)} disabled={!s.canGo} aria-current={s.onScreen ? "step" : undefined} className="group flex flex-col items-center gap-1.5 rounded-xl px-1 disabled:cursor-default">
                  <span
                    style={s.onScreen ? { viewTransitionName: "gd-step-dot" } : undefined}
                    className={cn(
                      "relative grid size-10 place-items-center rounded-full transition-[background-color,color,box-shadow] duration-300",
                      s.bad ? "bg-destructive text-white" : s.onScreen ? "bg-[var(--gd-step)] text-white shadow-[0_0_0_5px_color-mix(in_oklab,var(--gd-step)_20%,transparent)]" : s.done ? "bg-[var(--lc-bubble)] text-[var(--gd-step-ink)] shadow-[inset_0_0_0_1.5px_var(--gd-step)]" : "bg-[var(--lc-bubble)] text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]",
                      s.canGo && "group-hover:scale-105",
                    )}
                  >
                    {s.bad ? <X className="size-4 stroke-[3]" /> : <Icon className="size-[18px]" />}
                    {s.done && !s.onScreen && (
                      <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-[var(--gd-step)] text-white ring-2 ring-[var(--lc-bubble)]">
                        <Check className="size-2.5 stroke-[3.5]" />
                      </span>
                    )}
                  </span>
                  <span className={cn("text-[13px] lg:text-[14px]", s.onScreen ? "font-semibold text-foreground" : s.done ? "text-foreground/75" : "text-muted-foreground", !s.onScreen && "max-sm:sr-only")}>
                    {LABEL[s.step]}
                    <OpenAgain s={s} locked={locked} />
                  </span>
                </button>
                <span className="mt-1 flex h-1.5 items-center">{s.step === "check" && s.onScreen && checkBars}</span>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
