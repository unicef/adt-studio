import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function HelpHint({
  content,
  side = "right",
  ariaLabel,
}: {
  content: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  ariaLabel?: string
}) {
  const { t } = useLingui()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? t`More info`}
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors",
            "hover:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          )}
        >
          <CircleHelp className="h-3 w-3" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[260px] text-center">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
