import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export const WIZARD_STEP_HEADING_ID = "publishing-wizard-step-heading"

interface WizardStepShellProps {
  stepNumber?: number
  stepCount?: number
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Header, scrolling body, pinned footer. The body is the only part that scrolls, so a long
 * error notice or a tall step list never pushes the footer's buttons out of the card.
 */
export function WizardStepShell({
  stepNumber,
  stepCount,
  title,
  description,
  children,
  footer,
  className,
}: WizardStepShellProps) {
  const showSteps = stepNumber !== undefined && stepCount !== undefined && stepCount > 1
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex shrink-0 flex-col gap-2.5 pb-5">
        {showSteps && (
          <>
            <div className="flex items-center gap-2">
              {Array.from({ length: stepCount }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none",
                    index < stepNumber ? "bg-primary" : "bg-border",
                  )}
                />
              ))}
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Trans>
                Step {stepNumber} of {stepCount}
              </Trans>
            </p>
          </>
        )}
        <h2
          id={WIZARD_STEP_HEADING_ID}
          tabIndex={-1}
          className="text-lg font-semibold tracking-tight text-foreground focus-visible:outline-none"
        >
          {title}
        </h2>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>

      {footer && (
        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-2 border-t pt-4">{footer}</div>
      )}
    </div>
  )
}
