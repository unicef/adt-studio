import { useLingui } from "@lingui/react/macro"
import { Check, Loader2, Minus, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RunStepActivity } from "./useRunActivity"

function StepStateIcon({ state, hex }: { state: RunStepActivity["state"]; hex: string }) {
  const { t } = useLingui()

  if (state === "done") {
    return (
      <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="size-2.5" strokeWidth={4} />
      </span>
    )
  }
  if (state === "skipped") {
    return <Minus className="size-3.5 shrink-0 text-muted-foreground/50" aria-label={t`Skipped`} />
  }
  if (state === "error") {
    return <XCircle className="size-3.5 shrink-0 text-red-500" />
  }
  if (state === "running") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin" style={{ color: hex }} />
  }
  return <span className="size-3.5 shrink-0 rounded-full border-[1.5px] border-border" />
}

export interface RunStepRowsProps {
  steps: RunStepActivity[]
  hex: string
  className?: string
}

export function RunStepRows({ steps, hex, className }: RunStepRowsProps) {
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {steps.map((step) => (
        <li key={step.name} className="flex flex-col gap-0.5">
          <div
            className={cn(
              "flex items-center gap-2 text-[12px]",
              step.state === "running" && "font-semibold text-foreground",
              step.state === "done" && "text-muted-foreground",
              step.state === "error" && "text-red-600 dark:text-red-400",
              (step.state === "idle" || step.state === "skipped") && "text-muted-foreground/60",
            )}
          >
            <StepStateIcon state={step.state} hex={hex} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                step.state === "skipped" && "line-through decoration-muted-foreground/40",
              )}
            >
              {step.label}
            </span>
            {step.state === "running" && step.progress && (
              <span
                className="max-w-[128px] shrink-0 truncate font-mono text-[11px] font-medium tabular-nums text-muted-foreground"
                title={step.progress}
              >
                {step.progress}
              </span>
            )}
          </div>
          {step.state === "error" && step.error && (
            <p className="pl-5.5 text-[10.5px] leading-snug text-red-500" title={step.error}>
              {step.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
