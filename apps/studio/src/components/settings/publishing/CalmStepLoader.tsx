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
  idleAction?: ReactNode
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
  idleAction,
}: CalmStepLoaderProps) {
  const { i18n } = useLingui()
  const total = steps.length
  const completed = stepStates.filter(isSettled).length
  const current = steps.find((step) => step.number === activeStep) ?? steps[0]

  if (!current) return null

  return (
    <div
      data-testid={rootTestId}
      className={cn(
        "flex flex-col items-center gap-5",
        status === "idle"
          ? "my-auto w-full max-w-2xl self-center rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-8 shadow-[0_20px_50px_-28px_rgb(79_70_229_/_0.35)]"
          : "flex-1 justify-center py-4",
      )}
    >
      <Medallion status={status} step={current} />

      <div
        className={cn(
          "flex max-w-sm flex-col items-center gap-1.5 text-center",
          status === "idle" ? "min-h-0 gap-2" : "min-h-[5.5rem]",
        )}
      >
        <span
          key={current.id}
          role="status"
          aria-live="polite"
          className={cn(
            "font-medium text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300",
            status === "idle" ? "text-lg font-semibold tracking-tight" : "text-base",
          )}
        >
          {status === "done"
            ? copy.done
            : status === "error"
              ? copy.error
              : status === "idle" && copy.idle
                ? copy.idle
                : i18n._(current.title)}
        </span>
        <p
          className={cn(
            "text-sm leading-6 text-muted-foreground",
            status === "idle" ? "min-h-0" : "min-h-12",
          )}
        >
          {status === "done"
            ? copy.doneDetail
            : status === "idle" && copy.idleDetail
              ? copy.idleDetail
              : i18n._(current.detail)}
        </p>
      </div>

      {status !== "idle" && (
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
            <span>{formatElapsed(elapsedMs)}</span>
          </span>
        </div>
      )}

      <ol
        className={cn(
          "w-full",
          status === "idle"
            ? "grid grid-cols-1 gap-x-5 gap-y-1 rounded-xl border border-indigo-100/80 bg-white/75 p-3 sm:grid-cols-2"
            : "mt-1 flex max-w-xs flex-col gap-1",
        )}
      >
        {steps.map((step, index) => {
          const state = stepStates[index] ?? "pending"
          const StepIcon = step.icon
          return (
            <li
              key={step.id}
              data-testid={`${testIdPrefix}-${step.number}`}
              data-step-id={step.id}
              data-state={state}
              className={cn(
                "flex items-center gap-2",
                status === "idle" ? "rounded-lg px-2 py-1.5 text-sm text-muted-foreground" : "text-xs",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded",
                      status === "idle"
                        ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100"
                        : isSettled(state)
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
                  className="ml-auto size-3 animate-spin text-indigo-500 motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>

      {status === "idle" && idleAction}
    </div>
  )
}
