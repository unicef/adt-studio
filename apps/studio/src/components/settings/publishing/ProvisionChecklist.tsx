import { Trans, useLingui } from "@lingui/react/macro"
import { Check, CircleDashed, Loader2, X } from "lucide-react"
import type { ProvisionStepStatus } from "@/api/client"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"
import { cn } from "@/lib/utils"
import { PROVISION_STEP_COPY } from "./provision-steps"

interface ProvisionChecklistProps {
  status: ProvisionStatus
  stepStates: readonly ProvisionStepStatus[]
  activeStep: number | null
}

const ICON_CLASS = "size-4 shrink-0 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"

function StepIcon({ state }: { state: ProvisionStepStatus }) {
  if (state === "done" || state === "skipped") {
    return <Check className={cn(ICON_CLASS, "text-emerald-600")} aria-hidden="true" />
  }
  if (state === "error") {
    return <X className={cn(ICON_CLASS, "text-destructive")} aria-hidden="true" />
  }
  if (state === "running") {
    return (
      <Loader2
        className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
        aria-hidden="true"
      />
    )
  }
  return <CircleDashed className={cn(ICON_CLASS, "text-muted-foreground/60")} aria-hidden="true" />
}

export function ProvisionChecklist({ status, stepStates, activeStep }: ProvisionChecklistProps) {
  const { i18n } = useLingui()
  const activeCopy = PROVISION_STEP_COPY.find((step) => step.number === activeStep)

  return (
    <div className="flex flex-col gap-3">
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm font-medium text-foreground"
      >
        {status === "running" && activeCopy && (
          <Trans>
            Step {activeCopy.number} of {PROVISION_STEP_COPY.length}: {i18n._(activeCopy.title)}
          </Trans>
        )}
        {status === "done" && <Trans>Publishing is set up.</Trans>}
        {status === "error" && <Trans>Setup stopped. Nothing was lost.</Trans>}
      </p>

      <ol className="flex flex-col gap-1">
        {PROVISION_STEP_COPY.map((step, index) => {
          const state = stepStates[index] ?? "pending"
          return (
            <li
              key={step.id}
              data-testid={`provision-step-${step.number}`}
              data-step-id={step.id}
              data-state={state}
              className={cn(
                "flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-[background-color,opacity] duration-300 motion-reduce:transition-none",
                state === "running" && "bg-primary/5",
                state === "error" && "bg-destructive/5",
                state === "pending" && "opacity-60",
              )}
            >
              <span className="mt-0.5">
                <StepIcon state={state} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "text-sm transition-colors duration-200 motion-reduce:transition-none",
                    state === "pending" ? "text-muted-foreground" : "font-medium text-foreground",
                  )}
                >
                  {i18n._(step.title)}
                </span>
                {state === "skipped" && (
                  <span className="text-xs leading-5 text-muted-foreground">
                    <Trans>Already there — nothing to change.</Trans>
                  </span>
                )}
                {(state === "running" || state === "error") && (
                  <span className="text-xs leading-5 text-muted-foreground">
                    {i18n._(step.detail)}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
