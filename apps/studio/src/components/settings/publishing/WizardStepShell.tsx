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
  /** Folds the title and description away, for a step whose body carries its own headline
   *  once it starts — setup's rail says "Setting up sharing", and a second title above it
   *  would say the same thing twice. */
  collapsed?: boolean
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
  collapsed = false,
}: WizardStepShellProps) {
  const showSteps = stepNumber !== undefined && stepCount !== undefined && stepCount > 1
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className={cn("flex shrink-0 flex-col gap-2.5", (showSteps || !collapsed) && "pb-5")}>
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
        <div
          aria-hidden={collapsed || undefined}
          inert={collapsed || undefined}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none",
            collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
          )}
        >
          <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
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
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>

      {footer && (
        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-2 border-t pt-4">{footer}</div>
      )}
    </div>
  )
}
