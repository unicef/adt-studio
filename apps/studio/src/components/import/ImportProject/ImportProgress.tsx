import { Fragment } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type ImportStep = 1 | 2 | 3

/**
 * Compact stepper for the import header. `failedStep` marks the step where the
 * flow stopped: a read failure stays on step 1 (nothing was reviewed yet), an
 * import failure on step 3.
 */
export function ImportProgress({
  current,
  failedStep = null,
}: {
  current: ImportStep
  failedStep?: ImportStep | null
}) {
  const { t } = useLingui()
  const steps = [t`Select archive`, t`Review`, t`Import`]

  return (
    <ol aria-label={t`Import progress`} className="flex shrink-0 items-center gap-2.5 text-[12.5px]">
      {steps.map((label, index) => {
        const step = (index + 1) as ImportStep
        const complete = step < current
        const isCurrent = step === current
        const failed = failedStep === step
        return (
          <Fragment key={label}>
            {index > 0 ? (
              <li
                aria-hidden="true"
                className={cn("h-px w-7 transition-colors duration-300", step <= current ? "bg-primary" : "bg-border")}
              />
            ) : null}
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-300",
                failed ? "font-semibold text-destructive" : isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border text-[10.5px] font-semibold tabular-nums transition-[color,background-color,border-color,box-shadow] duration-300",
                  failed
                    ? "border-destructive text-destructive ring-[3px] ring-destructive/15"
                    : complete
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border-primary text-primary ring-[3px] ring-primary/15"
                        : "border-border text-muted-foreground",
                )}
              >
                {failed ? "!" : complete ? <Check aria-hidden="true" className="size-3" /> : step}
              </span>
              {label}
              {failed ? <span className="sr-only"><Trans>Failed</Trans></span> : null}
              {complete ? <span className="sr-only"><Trans>Completed</Trans></span> : null}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
