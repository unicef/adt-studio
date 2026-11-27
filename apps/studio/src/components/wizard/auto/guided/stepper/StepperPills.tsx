import { useLingui } from "@lingui/react/macro"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { LABEL, OpenAgain, stepStates, type StepperProps } from "./shared"

/**
 * Pills: one rounded track, centred, with the step on screen as a filled pill that slides from
 * step to step. Done steps carry a tick; Check's screens show as small bars under the track.
 */
export function StepperPills(props: StepperProps) {
  const { t } = useLingui()
  const { locked, onGo, checkBars, shown } = props
  return (
    <nav aria-label={t`Add Book steps`} className="flex flex-col items-center gap-2">
      <ol className="flex max-w-full items-center gap-0.5 rounded-full bg-[var(--lc-bubble)] p-1 shadow-[var(--lc-shadow)]">
        {stepStates(props).map((s) => (
          <li key={s.step} className="relative">
            {s.onScreen && <span aria-hidden className={cn("absolute inset-0 rounded-full", s.bad ? "bg-destructive" : "bg-[var(--gd-step)]")} style={{ viewTransitionName: "gd-step-dot" }} />}
            <button
              type="button"
              onClick={() => onGo(s.step)}
              disabled={!s.canGo}
              aria-current={s.onScreen ? "step" : undefined}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] transition-colors duration-200 disabled:cursor-default sm:px-4 lg:text-[14.5px]",
                s.onScreen ? "font-semibold text-white" : s.done ? "text-foreground/80" : "text-muted-foreground",
                s.canGo && "hover:bg-muted",
              )}
            >
              {s.bad ? <X className="size-3.5 stroke-[3]" /> : s.done && !s.onScreen ? <Check className="size-3.5 stroke-[3] text-[var(--gd-step-ink)]" /> : <span className="tabular-nums opacity-70">{s.i + 1}</span>}
              <span className={cn(!s.onScreen && "max-sm:sr-only")}>{LABEL[s.step]}</span>
              <OpenAgain s={s} locked={locked} />
            </button>
          </li>
        ))}
      </ol>
      <span className={cn("flex h-1.5 items-center", !(shown === "check" && checkBars) && "invisible")}>{shown === "check" && checkBars}</span>
    </nav>
  )
}
