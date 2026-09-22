import { useRef, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { formatElapsed } from "@/lib/elapsed"
import type { LoaderStatus, LoaderStep, LoaderStepState } from "./CalmStepLoader"
import { isSettled, useStepDurations } from "./rail-shared"
import { RailBloom } from "./RailBloom"

export interface ProvisionRailProps {
  steps: readonly LoaderStep[]
  status: LoaderStatus
  stepStates: readonly LoaderStepState[]
  activeStep?: number | null
  elapsedMs: number
  testIdPrefix: string
  rootTestId?: string
  copy: {
    done: string
    doneDetail: string
    error: string
    errorDetail: string
    idle?: string
    idleDetail?: string
    running?: string
    runningDetail?: string
  }
  errorContent?: ReactNode
}

export function ProvisionRail({
  steps,
  status,
  stepStates,
  elapsedMs,
  testIdPrefix,
  rootTestId,
  copy,
  errorContent,
}: ProvisionRailProps) {
  const { i18n } = useLingui()
  const durations = useStepDurations(stepStates)

  const total = steps.length
  const settled = stepStates.filter(isSettled).length
  const failedAt = stepStates.indexOf("error")
  const runningAt = stepStates.indexOf("running")

  const activeRef = useRef(0)
  if (status === "idle") activeRef.current = 0
  else if (failedAt >= 0) activeRef.current = failedAt
  else if (runningAt >= 0) activeRef.current = runningAt
  else if (status === "done") activeRef.current = Math.max(total - 1, 0)
  const active = Math.min(activeRef.current, Math.max(total - 1, 0))
  const focused = status === "running" || status === "error" ? active : -1
  const finished = status === "done"

  /** Fixed for the whole run. The step-by-step narration lives under the rail, next to the
   *  icons the eye is already on; a second copy of it up here would change out of view. */
  const headline =
    status === "done"
      ? copy.done
      : status === "error"
        ? copy.error
        : status === "running"
          ? (copy.running ?? "")
          : (copy.idle ?? "")
  const detail =
    status === "done"
      ? copy.doneDetail
      : status === "error"
        ? copy.errorDetail
        : status === "running"
          ? (copy.runningDetail ?? "")
          : (copy.idleDetail ?? "")

  return (
    <div data-testid={rootTestId} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex min-h-[4.75rem] flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div
          key={status}
          className="min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
        >
          <p className="truncate text-base font-semibold tracking-tight text-foreground">
            {headline}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          <Trans>
            {settled} of {total}
          </Trans>
          <span className={cn("ml-3", status === "idle" && "invisible")}>
            {formatElapsed(elapsedMs)}
          </span>
        </p>
      </div>

      <RailBloom
        steps={steps}
        status={status}
        stepStates={stepStates}
        testIdPrefix={testIdPrefix}
        focused={focused}
        finished={finished}
        failedAt={failedAt}
        durations={durations}
      />

      {status === "error" && errorContent ? (
        <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
          {errorContent}
        </div>
      ) : null}
    </div>
  )
}
