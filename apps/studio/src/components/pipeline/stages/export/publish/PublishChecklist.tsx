import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Loader2, X } from "lucide-react"
import type {
  PublishChecklistState,
  PublishRunKind,
  PublishRunStatus,
} from "@/hooks/use-book-publication"
import { cn } from "@/lib/utils"
import { PUBLISH_STEP_COPY } from "./publish-steps"

interface PublishChecklistProps {
  status: PublishRunStatus
  kind: PublishRunKind
  stepStates: readonly PublishChecklistState[]
  activeStep: number | null
}

const ICON_CLASS = "size-3.5 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"

function StepIcon({ state }: { state: PublishChecklistState }) {
  if (state === "done") {
    return <Check className={ICON_CLASS} aria-hidden="true" />
  }
  if (state === "error") {
    return <X className={ICON_CLASS} aria-hidden="true" />
  }
  if (state === "running") {
    return (
      <Loader2
        className="size-3.5 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
    )
  }
  return <span className="size-1.5 rounded-full bg-border" aria-hidden="true" />
}

export function PublishChecklist({
  status,
  kind,
  stepStates,
  activeStep,
}: PublishChecklistProps) {
  const { i18n, t } = useLingui()
  const activeCopy = PUBLISH_STEP_COPY.find((step) => step.number === activeStep)

  return (
    <div
      data-testid="publish-checklist"
      className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            status === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-indigo-100 text-indigo-700",
          )}
        >
          {status === "running" ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : status === "error" ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-sm font-semibold text-foreground"
          >
            {status === "running" && activeCopy && i18n._(activeCopy.title)}
            {status === "done" &&
              (kind === "update" ? (
                <Trans>Your latest version is live.</Trans>
              ) : (
                <Trans>Your book is online.</Trans>
              ))}
            {status === "error" && <Trans>Publishing stopped. Your book wasn't changed.</Trans>}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {status === "running" && activeCopy && (
              <Trans>
                Step {activeCopy.number} of {PUBLISH_STEP_COPY.length}: {i18n._(activeCopy.detail)}
              </Trans>
            )}
            {status === "done" && <Trans>The share link is ready.</Trans>}
            {status === "error" && activeCopy && i18n._(activeCopy.detail)}
          </p>
        </div>
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label={t`Publishing progress`}>
        {PUBLISH_STEP_COPY.map((step, index) => {
          const state = stepStates[index] ?? "pending"
          return (
            <li
              key={step.id}
              data-testid={`publish-step-${step.number}`}
              data-step-id={step.id}
              data-state={state}
              className={cn(
                "flex min-w-0 flex-col gap-2 transition-opacity duration-200 motion-reduce:transition-none",
                state === "pending" && "opacity-55",
              )}
            >
              <span
                className={cn(
                  "h-1.5 overflow-hidden rounded-full bg-border transition-colors duration-300 motion-reduce:transition-none",
                  (state === "done" || state === "running") && "bg-indigo-600",
                  state === "error" && "bg-destructive",
                )}
              >
                {state === "running" && (
                  <span className="block h-full w-2/3 animate-pulse rounded-full bg-indigo-400 motion-reduce:animate-none" />
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border bg-background",
                    state === "done" && "border-indigo-200 text-indigo-700",
                    state === "running" && "border-indigo-300 text-indigo-700",
                    state === "error" && "border-destructive/30 text-destructive",
                  )}
                >
                  <StepIcon state={state} />
                </span>
                <span
                  className={cn(
                    "truncate text-[11px] leading-4 text-muted-foreground sm:text-xs",
                    state !== "pending" && "font-medium text-foreground",
                  )}
                >
                  {i18n._(step.title)}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
