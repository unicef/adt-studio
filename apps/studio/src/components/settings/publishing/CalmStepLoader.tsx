import type { ComponentType, ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElapsed } from "@/lib/elapsed"

/**
 * The calm loader, shared by the two long jobs in publishing: provisioning a Cloudflare account
 * and publishing a book.
 *
 * One moving part on the screen — a sweeping ring, a breathing halo, and the current step's own
 * icon swapped with a crossfade. Everything else holds still, including the space reserved for
 * the copy, because a loader that reflows on every step reads as a machine in trouble.
 *
 * Idle and running share one geometry on purpose: pressing "Set up" only swaps the button for
 * the progress bar, so the screen does not rebuild itself the moment work begins.
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
    /** Required because the alternative is falling back to the running step's own detail, which
     * under a failure headline reads as a description of something that just did not happen. */
    errorDetail: string
    idle?: string
    idleDetail?: string
  }
  idleAction?: ReactNode
  /** Replaces the checklist after a failed operation while retaining the status summary. */
  errorContent?: ReactNode
}

function isSettled(state: LoaderStepState): boolean {
  return state === "done" || state === "skipped"
}

/* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS mask, not UI copy */
const RING_MASK = "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))"

function Medallion({ status, step }: { status: LoaderStatus; step: LoaderStep }) {
  const StepIcon = step.icon
  const working = status === "running" || status === "idle"

  return (
    <span className="relative flex size-20 items-center justify-center">
      {working && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-1 rounded-full bg-brand-100/80 motion-safe:animate-medallion-halo"
          />
          {status === "running" && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full motion-safe:animate-spin motion-reduce:opacity-40"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, transparent 200deg, var(--brand-500) 340deg, var(--brand-500) 360deg)",
                maskImage: RING_MASK,
                WebkitMaskImage: RING_MASK,
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
              : "bg-card text-brand-600 shadow-sm ring-1 ring-brand-200 dark:bg-accent",
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
  idleAction,
  errorContent,
}: CalmStepLoaderProps) {
  const { i18n } = useLingui()
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
          className="text-lg font-semibold tracking-tight text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
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
            : status === "error"
              ? copy.errorDetail
              : status === "idle" && copy.idleDetail
                ? copy.idleDetail
                : i18n._(current.detail)}
        </p>
      </div>

      {/* Reserved while idle so the list below does not jump down the moment work starts. */}
      <div
        aria-hidden={status === "idle"}
        className={cn(
          "flex w-full max-w-xs flex-col gap-1.5 transition-opacity duration-300 motion-reduce:transition-none",
          status === "idle" && "invisible",
        )}
      >
        <span className="h-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
              status === "error" ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </span>
        <span className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <Trans>
            {completed} of {total}
          </Trans>
          <span>{formatElapsed(elapsedMs)}</span>
        </span>
      </div>

      {status === "error" && errorContent ? (
        <div className="w-full max-w-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
          {errorContent}
        </div>
      ) : (
        <ol className="flex w-full max-w-xs flex-col gap-1">
          {steps.map((step, index) => {
            const state = stepStates[index] ?? "pending"
            const StepIcon = step.icon
            return (
              <li
                key={step.id}
                data-testid={`${testIdPrefix}-${step.number}`}
                data-step-id={step.id}
                data-state={state}
                className="flex items-center gap-2.5 text-[13px]"
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded transition-colors duration-300 motion-reduce:transition-none",
                    status === "idle"
                      ? "text-brand-600"
                      : isSettled(state)
                        ? "text-emerald-600 dark:text-emerald-400"
                        : state === "running"
                          ? "bg-brand-50 text-brand-600 ring-1 ring-brand-200"
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
                    "transition-colors duration-300 motion-reduce:transition-none",
                    status === "idle"
                      ? "text-foreground/80"
                      : state === "pending"
                        ? "text-muted-foreground/70"
                        : "text-foreground",
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
                    className="ml-auto size-3 animate-spin text-brand-500 motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}

      {status === "idle" && idleAction && (
        <div className="pt-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
          {idleAction}
        </div>
      )}
    </div>
  )
}
