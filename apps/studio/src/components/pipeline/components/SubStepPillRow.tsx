import { type ComponentProps, type Ref } from "react"
import { AlertTriangle, Check, Circle, Loader2, Minus, XCircle } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  getStepDescriptionI18n,
  getStepLabelI18n,
} from "../pipeline-i18n"
import { type StageSubStep } from "./StageRunCard"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { isAttentionNote } from "./step-notes"

export function SubStepPillRow({
  subSteps,
  stepState,
  stepProgress,
  stepError,
  stepMessage,
}: {
  subSteps: StageSubStep[]
  stepState: (key: string) => string
  stepProgress: (
    key: string,
  ) => { page?: number; totalPages?: number } | undefined
  stepError: (key: string) => string | undefined
  /** Completion note of a finished step, shown in the popover. */
  stepMessage?: (key: string) => string | undefined
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {subSteps.map((subStep) => {
        const state = stepState(subStep.key)
        const note = stepMessage?.(subStep.key)
        const hasWarning = state === "done" && !!note && isAttentionNote(note)
        return (
          <Tooltip key={subStep.key}>
            <TooltipTrigger asChild>
              <SubStepPillButton stepKey={subStep.key} state={state} hasWarning={hasWarning} />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              showArrow={false}
              className={cn(
                "max-w-none border-0 bg-transparent p-0 shadow-none",
                "duration-300 ease-out",
                "[--tw-enter-scale:1] [--tw-exit-scale:1]",
                "data-[side=top]:slide-in-from-bottom-[0.75rem]",
                "data-[side=bottom]:[--tw-enter-translate-y:-0.75rem]",
                "data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0",
                "data-[side=top]:data-[state=instant-open]:slide-in-from-bottom-2",
                "data-[side=bottom]:data-[state=instant-open]:slide-in-from-top-2",
              )}
            >
              <SubStepPopoverCard
                stepKey={subStep.key}
                state={state}
                progress={stepProgress(subStep.key)}
                errorMessage={stepError(subStep.key)}
                completionNote={note}
              />
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function SubStepPillButton({
  stepKey,
  state,
  hasWarning = false,
  ref,
  ...rest
}: {
  stepKey: string
  state: string
  /** The step finished but left a "Completed —" warning (pages skipped or left unchanged). */
  hasWarning?: boolean
  ref?: Ref<HTMLSpanElement>
} & Omit<ComponentProps<"span">, "ref">) {
  const { t } = useLingui()
  const isDone = state === "done"
  const isSkipped = state === "skipped"
  const isError = state === "error"
  const isRunning = state === "running"
  const label = getStepLabelI18n(stepKey)

  return (
    <span
      ref={ref}
      tabIndex={0}
      {...rest}
      className="relative inline-flex cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <span
        aria-hidden
        className="pointer-events-none invisible inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
        {label}
      </span>
      <span
        className={cn(
          "absolute inset-0 inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
          "transition-all duration-200 ease-out",
          "hover:-translate-y-px hover:shadow-sm active:translate-y-0",
          isDone && hasWarning
            ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70 hover:bg-amber-100/80 hover:ring-amber-300"
            : isDone
            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70 hover:bg-emerald-100/80 hover:ring-emerald-300"
            : isError
              ? "bg-red-50 text-red-800 ring-1 ring-red-200/70 hover:bg-red-100/80 hover:ring-red-300"
              : isRunning
                ? "bg-blue-50 text-blue-800 ring-1 ring-blue-200/70 hover:bg-blue-100/80 hover:ring-blue-300"
                : isSkipped
                  ? "bg-muted/40 text-muted-foreground/60 line-through ring-1 ring-border/50 hover:bg-muted/70 hover:text-muted-foreground hover:ring-border"
                  : "bg-muted/60 text-muted-foreground ring-1 ring-border/60 hover:bg-muted hover:text-foreground hover:ring-border",
        )}
      >
        {isDone && hasWarning && <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} aria-label={t`Completed with a warning`} />}
        {isDone && !hasWarning && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
        {isRunning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
        {label}
      </span>
    </span>
  )
}

function SubStepPopoverCard({
  stepKey,
  state,
  progress,
  errorMessage,
  completionNote,
}: {
  stepKey: string
  state: string
  progress?: { page?: number; totalPages?: number }
  errorMessage?: string
  completionNote?: string
}) {
  const { t } = useLingui()
  const isDone = state === "done"
  const isSkipped = state === "skipped"
  const isError = state === "error"
  const isRunning = state === "running"
  const label = getStepLabelI18n(stepKey)
  const description = getStepDescriptionI18n(stepKey)
  const hasPages =
    isRunning &&
    progress?.page != null &&
    progress?.totalPages != null &&
    progress.totalPages > 0
  const progressPercent = hasPages
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round((progress!.page! / progress!.totalPages!) * 100),
        ),
      )
    : 0

  const stateLabel = isDone
    ? t`Completed`
    : isRunning
      ? t`Running`
      : isError
        ? t`Failed`
        : isSkipped
          ? t`Skipped`
          : t`Not started yet`

  const stateDotClass = isDone
    ? "bg-emerald-500"
    : isRunning
      ? "bg-blue-500 animate-pulse"
      : isError
        ? "bg-red-500"
        : isSkipped
          ? "bg-muted-foreground/40"
          : "bg-muted-foreground/30"

  return (
    <div className="flex w-85 flex-col items-stretch gap-0 overflow-hidden rounded-xl border border-border bg-card text-left text-foreground shadow-xl">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
            isDone
              ? "bg-emerald-100 text-emerald-700"
              : isRunning
                ? "bg-blue-100 text-blue-700"
                : isError
                  ? "bg-red-100 text-red-700"
                  : isSkipped
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted text-muted-foreground",
          )}
        >
          {isDone ? (
            <Check className="h-4 w-4" strokeWidth={2.5} />
          ) : isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isError ? (
            <XCircle className="h-4 w-4" />
          ) : isSkipped ? (
            <Minus className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" strokeWidth={1.75} />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {label}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider transition-colors duration-200",
                isDone
                  ? "bg-emerald-100 text-emerald-700"
                  : isRunning
                    ? "bg-blue-100 text-blue-700"
                    : isError
                      ? "bg-red-100 text-red-700"
                      : isSkipped
                        ? "bg-muted text-muted-foreground"
                        : "bg-muted text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors duration-200",
                  stateDotClass,
                )}
              />
              {stateLabel}
            </span>
          </div>
          {description && (
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {(hasPages || (isError && errorMessage) || (isDone && completionNote) || isSkipped) && (
        <div className="flex flex-col gap-2 border-t border-border/70 bg-muted/30 px-3.5 py-2.5">
          {hasPages && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10.5px] tabular-nums">
                <span className="font-medium text-muted-foreground">
                  <Trans>Progress</Trans>
                </span>
                <span className="font-semibold text-foreground">
                  <Trans>
                    {progress?.page} / {progress?.totalPages}
                  </Trans>
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100">
                <div
                  aria-hidden
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
          {isDone && completionNote && (
            <p className={cn("text-[10.5px] leading-relaxed break-words", isAttentionNote(completionNote) ? "text-amber-700" : "text-muted-foreground")}>
              {completionNote}
            </p>
          )}
          {isError && errorMessage && (
            <p className="break-words text-[10.5px] leading-snug text-red-700">
              {errorMessage}
            </p>
          )}
          {isSkipped && (
            <p className="text-[10.5px] italic leading-relaxed text-muted-foreground">
              <Trans>
                Not run during the last execution — likely because its
                inputs weren't ready or its stage's settings turned it
                off.
              </Trans>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
