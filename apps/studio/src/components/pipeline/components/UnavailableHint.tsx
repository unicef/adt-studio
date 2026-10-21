import { useState, type ReactElement, type ReactNode } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Explains why a control is unavailable without replacing its description:
 * the tooltip opens on hover and focus like any tooltip, and a click toggles
 * it (Radix closes a tooltip on trigger click by default; the controlled open
 * state and `preventDefault` below override that).
 *
 * The child must receive pointer events. A control carrying the `disabled`
 * attribute does not, so either render it with `aria-disabled` instead, or
 * wrap it in a focusable `<span tabIndex={0}>` and give the control
 * `pointer-events-none`.
 */
export function UnavailableHint({
  hint,
  children,
}: {
  hint: ReactNode
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          asChild
          onClick={(event) => {
            event.preventDefault()
            setOpen((current) => !current)
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-center">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
