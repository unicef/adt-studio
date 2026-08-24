import { Trans, useLingui } from "@lingui/react/macro"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

import type { ImportPhase } from "./helpers"

export function ImportProgress({
  phase,
  hasPreviewError,
  hasImportError,
  reviewNeedsAttention = false,
}: {
  phase: ImportPhase
  hasPreviewError: boolean
  hasImportError: boolean
  reviewNeedsAttention?: boolean
}) {
  const { t } = useLingui()
  const activeIndex = phase === "select" ? 0 : phase === "reading" || phase === "review" ? 1 : 2
  const steps = [t`Select archive`, t`Review details`, t`Import project`]

  return (
    <ol aria-label={t`Import progress`} className="mx-auto mt-5 flex w-full max-w-xl items-start">
      {steps.map((label, index) => {
        const complete = index < activeIndex
        const current = index === activeIndex
        const failed = (hasPreviewError && index === 1) || (hasImportError && index === 2)
        const needsAttention = reviewNeedsAttention && index === 1
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-1/2 top-3 h-px w-full transition-colors duration-150",
                  complete ? "bg-primary" : "bg-slate-200",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-150",
                failed
                  ? "border-red-500 bg-red-50 text-red-600"
                  : needsAttention
                    ? "border-amber-500 bg-amber-50 text-amber-700 ring-4 ring-amber-100/70"
                  : complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary bg-white text-primary ring-4 ring-primary/15"
                      : "border-slate-300 bg-white text-slate-400",
              )}
              aria-current={current ? "step" : undefined}
            >
              {failed || needsAttention ? (
                <>
                  <AlertCircle aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only">
                    {failed ? <Trans>Failed</Trans> : <Trans>Needs attention</Trans>}
                  </span>
                </>
              ) : complete ? (
                <>
                  <Check aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only"><Trans>Completed</Trans></span>
                </>
              ) : index + 1}
            </span>
            <span className={cn(
              "relative z-10 whitespace-nowrap text-xs",
              current || complete ? "font-medium text-slate-800" : "text-slate-500",
              failed && "font-medium text-red-700",
              needsAttention && "font-medium text-amber-800",
            )}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
