import { useId } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { DisabledReason } from "../StepActionButton"
import type { ProblemAction } from "./ProblemNotice"

export function ProblemActionButton({ action, className }: { action: ProblemAction; className?: string }) {
  const reasonId = useId()
  const disabled = action.disabled === true
  const showReason = disabled && !!action.disabledReason
  const button = (
    <button
      type="button"
      onClick={disabled ? undefined : action.onClick}
      aria-disabled={disabled || undefined}
      aria-describedby={showReason ? reasonId : undefined}
      className={cn("flex shrink-0 items-center gap-1.5 transition-colors duration-200 motion-reduce:transition-none", className)}
    >
      {action.icon && <action.icon className="size-3.5" />}
      {action.label}
    </button>
  )
  if (!showReason) return button
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent aria-hidden side="bottom" sideOffset={6} className="max-w-[260px] text-[11.5px] leading-snug">
          {action.disabledReason}
        </TooltipContent>
      </Tooltip>
      <DisabledReason id={reasonId} reason={action.disabledReason} />
    </>
  )
}
