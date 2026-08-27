import { useState, type ComponentType } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check, ChevronDown, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElapsed } from "@/components/settings/publishing/provision-elapsed"

/**
 * The calm loader, shared by the two long jobs in publishing: provisioning a Cloudflare account
 * and publishing a book.
 *
 * One moving part on the screen — a sweeping ring, a breathing halo, and the current step's own
 * icon swapped with a crossfade. Everything else holds still, including the space reserved for
 * the copy, because a loader that reflows on every step reads as a machine in trouble.
 *
 * It was written for provisioning first; publishing asked for "the same experience", which is
 * the whole reason it now lives here rather than in either flow.
 */

export type LoaderStatus = "idle" | "running" | "done" | "error"

export type LoaderStepState = "pending" | "running" | "done" | "error" | "skipped"

export interface LoaderStep {
  id: string
  number: number
  title: MessageDescriptor
  detail: MessageDescriptor
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
}

export interface CalmStepLoaderProps {
  steps: readonly LoaderStep[]
  status: LoaderStatus
  stepStates: readonly LoaderStepState[]
  activeStep: number | null
  elapsedMs: number
  /** Prefix for each step row's `data-testid`. Each flow keeps its own so a test reads as being
   *  about provisioning or about publishing, not about a shared widget. */
  testIdPrefix: string
  /** Test hook for the loader as a whole, so a flow can assert "the loader is up". */
  rootTestId?: string
  /** What the headline says when there is nothing left to do, or nothing started yet. */
  copy: {
    done: string
    doneDetail: string
    error: string
    idle?: string
    idleDetail?: string
  }
}

function isSettled(state: LoaderStepState): boolean {
  return state === "done" || state === "skipped"
}

function Medallion({ status, step }: { status: LoaderStatus; step: LoaderStep }) {
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

export function CalmStepLoader({
  steps,
  status,
  stepStates,
  activeStep,
  elapsedMs,
  testIdPrefix,
  rootTestId,
  copy,
}: CalmStepLoaderProps) {
  const { i18n } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const total = steps.length
  const completed = stepStates.filter(isSettled).length
  const current = steps.find((step) => step.number === activeStep) ?? steps[0]

  if (!current) return null

  return (
    <div
      data-testid={rootTestId}
      className="flex flex-1 flex-col items-center justify-center gap-5 py-4"
    >
      <Medallion status={status} step={current} />

      <div className="flex min-h-[5.5rem] max-w-sm flex-col items-center gap-1.5 text-center">
        <span
          key={current.id}
          role="status"
          aria-live="polite"
          className="text-base font-medium text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
        >
          {status === "done"
            ? copy.done
            : status === "error"
              ? copy.error
              : status === "idle" && copy.idle
                ? copy.idle
                : i18n._(current.title)}
        </span>
        <p className="min-h-12 text-sm leading-6 text-muted-foreground">
          {status === "done"
            ? copy.doneDetail
            : status === "idle" && copy.idleDetail
              ? copy.idleDetail
              : i18n._(current.detail)}
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
            {steps.map((step, index) => {
              const state = stepStates[index] ?? "pending"
              const StepIcon = step.icon
              return (
                <li
                  key={step.id}
                  data-testid={`${testIdPrefix}-${step.number}`}
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
