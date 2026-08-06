import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, Loader2, X } from "lucide-react"
import type { ProvisionStepStatus } from "@/api/client"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"
import { cn } from "@/lib/utils"
import { PROVISION_STEP_COPY, type ProvisionStepCopy } from "./provision-steps"
import { formatElapsed } from "./provision-elapsed"

interface ProvisionCalmProps {
  status: ProvisionStatus
  stepStates: readonly ProvisionStepStatus[]
  activeStep: number | null
  elapsedMs: number
}

function isSettled(state: ProvisionStepStatus): boolean {
  return state === "done" || state === "skipped"
}

/** The one moving part of the screen: a sweeping ring, a breathing halo and the
 *  current step's own icon, swapped with a crossfade as the work advances. */
function Medallion({ status, step }: { status: ProvisionStatus; step: ProvisionStepCopy }) {
  const StepIcon = step.icon
  const working = status === "running" || status === "idle"

  return (
    <span className="relative flex size-20 items-center justify-center">
      {working && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-1 rounded-full bg-indigo-100 motion-safe:animate-medallion-halo"
          />
          {status === "running" && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full motion-safe:animate-spin motion-reduce:opacity-40"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, #6366f1 340deg, #6366f1 360deg)",
                maskImage:
                  "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
                WebkitMaskImage:
                  "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
              }}
            />
          )}
        </>
      )}

      <span
        className={cn(
          "relative flex size-14 items-center justify-center rounded-full transition-colors duration-500 motion-reduce:transition-none",
          status === "done"
            ? "bg-emerald-500 text-white"
            : status === "error"
              ? "bg-destructive text-white"
              : "bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100",
        )}
      >
        {status === "done" ? (
          <Check
            className="size-7 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300"
            aria-hidden="true"
          />
        ) : status === "error" ? (
          <X className="size-7" aria-hidden="true" />
        ) : (
          <StepIcon
            key={step.id}
            className="size-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-500"
            aria-hidden="true"
          />
        )}
      </span>
    </span>
  )
}

export function ProvisionCalm({ status, stepStates, activeStep, elapsedMs }: ProvisionCalmProps) {
  const { i18n } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const total = PROVISION_STEP_COPY.length
  const completed = stepStates.filter(isSettled).length
  const current =
    PROVISION_STEP_COPY.find((step) => step.number === activeStep) ?? PROVISION_STEP_COPY[0]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4">
      <Medallion status={status} step={current} />

      <div className="flex min-h-[5.5rem] max-w-sm flex-col items-center gap-1.5 text-center">
        <span
          key={current.id}
          role="status"
          aria-live="polite"
          className="text-base font-medium text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
        >
          {status === "done" ? (
            <Trans>Publishing is ready</Trans>
          ) : status === "error" ? (
            <Trans>Setup stopped</Trans>
          ) : status === "idle" ? (
            <Trans>Ready when you are</Trans>
          ) : (
            i18n._(current.title)
          )}
        </span>
        <p className="min-h-12 text-sm leading-6 text-muted-foreground">
          {status === "done" ? (
            <Trans>Everything is in place in your Cloudflare account.</Trans>
          ) : status === "idle" ? (
            <Trans>Eight small things get created in your account. Nothing is charged.</Trans>
          ) : (
            i18n._(current.detail)
          )}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-1.5">
        <span className="h-1 overflow-hidden rounded-full bg-zinc-100">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
              status === "error" ? "bg-destructive" : "bg-indigo-600",
            )}
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </span>
        <span className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <Trans>
            {completed} of {total}
          </Trans>
          {status !== "idle" && <span>{formatElapsed(elapsedMs)}</span>}
        </span>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? <Trans>Hide the steps</Trans> : <Trans>Show all steps</Trans>}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        <ol
          className={cn(
            "grid w-full gap-1 overflow-hidden transition-all duration-300 motion-reduce:transition-none",
            expanded ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="flex min-h-0 flex-col gap-1">
            {PROVISION_STEP_COPY.map((step, index) => {
              const state = stepStates[index] ?? "pending"
              const StepIcon = step.icon
              return (
                <li
                  key={step.id}
                  data-testid={`provision-step-${step.number}`}
                  data-step-id={step.id}
                  data-state={state}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded",
                      isSettled(state)
                        ? "text-emerald-600"
                        : state === "running"
                          ? "bg-indigo-50 text-indigo-600"
                          : state === "error"
                            ? "text-destructive"
                            : "text-muted-foreground/50",
                    )}
                  >
                    {isSettled(state) ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : state === "running" ? (
                      <StepIcon className="size-3.5" aria-hidden="true" />
                    ) : state === "error" ? (
                      <X className="size-3.5" aria-hidden="true" />
                    ) : (
                      <StepIcon className="size-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={cn(
                      state === "pending" ? "text-muted-foreground/70" : "text-foreground",
                      state === "running" && "font-medium",
                    )}
                  >
                    {i18n._(step.title)}
                  </span>
                  {state === "skipped" && (
                    <span className="text-[10px] text-muted-foreground">
                      <Trans>already there</Trans>
                    </span>
                  )}
                  {state === "running" && (
                    <Loader2
                      className="ml-auto size-3 animate-spin text-indigo-500 motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  )}
                </li>
              )
            })}
          </div>
        </ol>
      </div>
    </div>
  )
}
