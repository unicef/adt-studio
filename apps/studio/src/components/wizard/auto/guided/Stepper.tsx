import type { ReactNode } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { STEPS, type StepId } from "./steps"

const NAME: Record<StepId, MessageDescriptor> = {
  upload: msg`Upload`,
  reading: msg`Reading`,
  check: msg`Check`,
  create: msg`Set up`,
}

/**
 * Upload · Reading · Check · Set up, as one quiet line: "Step 3 of 4 · Check", with four dots on the
 * right. The steps already done open again from their dot (unless the book is being created).
 * `failed` marks the current step when something went wrong there, `complete` fills every dot once
 * the book is made, and on Check `checkBars` shows its screens next to the name.
 */
export function Stepper({ at, shown, failed, locked, complete, onGo, checkBars }: { at: StepId; shown: StepId; failed: boolean; locked: boolean; complete: boolean; onGo: (step: StepId) => void; checkBars?: ReactNode }) {
  const { t, i18n } = useLingui()
  const atIndex = STEPS.indexOf(at)
  const n = STEPS.indexOf(shown) + 1
  const total = STEPS.length
  return (
    <nav aria-label={t`Add Book steps`} className="flex items-center gap-3">
      <span className="text-[13px] tabular-nums text-muted-foreground lg:text-[14px]">
        <Trans>
          Step {n} of {total}
        </Trans>
      </span>
      <span className="text-[15px] font-semibold lg:text-[16.5px]">{i18n._(NAME[shown])}</span>
      {shown === "check" && checkBars}
      <ol className="ml-auto flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const done = i < atIndex || complete
          const onScreen = step === shown
          const canGo = !onScreen && (step === at || (done && !locked))
          const bad = step === at && failed
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => onGo(step)}
                disabled={!canGo}
                aria-current={onScreen ? "step" : undefined}
                aria-label={i18n._(NAME[step])}
                title={i18n._(NAME[step])}
                style={onScreen ? { viewTransitionName: "gd-step-dot" } : undefined}
                className={cn("block h-2 rounded-full transition-[width,background-color] duration-300 disabled:cursor-default motion-reduce:transition-none", onScreen ? "w-6" : "w-2", bad ? "bg-destructive" : onScreen || done ? "bg-[var(--gd-step)]" : "bg-border", canGo && "hover:opacity-70")}
              />
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
