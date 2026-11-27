import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { STEPS } from "../steps"
import { LABEL, stepStates, useStepName, type StepperProps } from "./shared"

/**
 * Compact: one quiet line, "Step 2 of 4 · Reading", with four dots on the right that open the
 * steps already done. Leaves the room to the assistant and the page.
 */
export function StepperCompact(props: StepperProps) {
  const { t } = useLingui()
  const name = useStepName()
  const { shown, onGo, checkBars } = props
  const n = STEPS.indexOf(shown) + 1
  const total = STEPS.length
  return (
    <nav aria-label={t`Add Book steps`} className="flex items-center gap-3">
      <span className="text-[13px] tabular-nums text-muted-foreground lg:text-[14px]">
        <Trans>
          Step {n} of {total}
        </Trans>
      </span>
      <span className="text-[15px] font-semibold lg:text-[16.5px]">{LABEL[shown]}</span>
      {shown === "check" && checkBars}
      <ol className="ml-auto flex items-center gap-1.5">
        {stepStates(props).map((s) => (
          <li key={s.step}>
            <button
              type="button"
              onClick={() => onGo(s.step)}
              disabled={!s.canGo}
              aria-current={s.onScreen ? "step" : undefined}
              aria-label={name(s.step)}
              title={name(s.step)}
              style={s.onScreen ? { viewTransitionName: "gd-step-dot" } : undefined}
              className={cn("block h-2 rounded-full transition-[width,background-color] duration-300 disabled:cursor-default motion-reduce:transition-none", s.onScreen ? "w-6" : "w-2", s.bad ? "bg-destructive" : s.onScreen || s.done ? "bg-[var(--gd-step)]" : "bg-border", s.canGo && "hover:opacity-70")}
            />
          </li>
        ))}
      </ol>
    </nav>
  )
}
