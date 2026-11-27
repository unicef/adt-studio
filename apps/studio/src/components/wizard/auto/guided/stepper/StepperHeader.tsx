import { Fragment } from "react"
import { useLingui } from "@lingui/react/macro"
import { Check, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LABEL, OpenAgain, stepStates, type StepperProps } from "./shared"

/**
 * In the header: the steps as a small breadcrumb in the middle of the app's top bar, so the page
 * starts with the assistant. The step on screen is bold with a short bar under it.
 */
export function StepperHeader(props: StepperProps) {
  const { t } = useLingui()
  const { locked, onGo, checkBars } = props
  return (
    <nav aria-label={t`Add Book steps`}>
      <ol className="flex items-center gap-0.5">
        {stepStates(props).map((s) => (
          <Fragment key={s.step}>
            {s.i > 0 && (
              <li aria-hidden className="text-muted-foreground/50 max-sm:hidden">
                <ChevronRight className="size-3.5" />
              </li>
            )}
            <li className="relative">
              <button
                type="button"
                onClick={() => onGo(s.step)}
                disabled={!s.canGo}
                aria-current={s.onScreen ? "step" : undefined}
                className={cn("flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] disabled:cursor-default", s.onScreen ? "font-semibold text-foreground" : s.done ? "text-foreground/70" : "text-muted-foreground", s.canGo && "hover:bg-muted", !s.onScreen && "max-sm:hidden")}
              >
                {s.bad ? <X className="size-3 stroke-[3] text-destructive" /> : s.done && !s.onScreen ? <Check className="size-3 stroke-[3] text-[var(--gd-step-ink)]" /> : null}
                {LABEL[s.step]}
                <OpenAgain s={s} locked={locked} />
              </button>
              {s.onScreen && (
                <span className="absolute -bottom-[7px] left-1/2 flex -translate-x-1/2 items-center" style={{ viewTransitionName: "gd-step-dot" }}>
                  {s.step === "check" && checkBars ? checkBars : <span className={cn("block h-[3px] w-5 rounded-full", s.bad ? "bg-destructive" : "bg-[var(--gd-step)]")} />}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
