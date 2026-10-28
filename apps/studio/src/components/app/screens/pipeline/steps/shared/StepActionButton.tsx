import { useId, type CSSProperties, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HeaderButtonTile } from "./headerButton"

export interface StepActionButtonProps {
  icon?: LucideIcon
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  disabledReason?: ReactNode
  tone?: "default" | "danger"
  accent?: string
  look?: "default" | "header"
  className?: string
}

const HEADER_LOOK_DISABLED = cn(
  "aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:shadow-none",
  "aria-disabled:hover:translate-y-0 aria-disabled:hover:border-border aria-disabled:hover:shadow-none aria-disabled:active:scale-100",
)

export function DisabledReason({ id, reason }: { id: string; reason: ReactNode }) {
  return (
    <span id={id} className="sr-only">
      {reason}
    </span>
  )
}

export function StepActionButton({
  icon: Icon,
  children,
  onClick,
  disabled = false,
  disabledReason,
  tone = "default",
  accent,
  look = "default",
  className,
}: StepActionButtonProps) {
  const reasonId = useId()
  const showReason = disabled && !!disabledReason
  const style: CSSProperties | undefined = accent && tone === "default" && look === "default" ? { borderColor: tint(accent, 0.3) } : undefined

  const button =
    look === "header" ? (
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled || undefined}
        aria-describedby={showReason ? reasonId : undefined}
        className={cn(HEADER_BUTTON, Icon ? HEADER_BUTTON_LABELLED : "px-3", "shrink-0", HEADER_LOOK_DISABLED, className)}
      >
        {Icon && <HeaderButtonTile icon={Icon} />}
        {children}
      </button>
    ) : (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-describedby={showReason ? reasonId : undefined}
      style={style}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium",
        "transition-[background-color,color,opacity] duration-200 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        tone === "danger"
          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted",
        disabled && "cursor-default border-border bg-muted text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </button>
    )

  if (!showReason) return button

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent aria-hidden side="bottom" sideOffset={6} className="max-w-[260px] text-[11.5px] leading-snug">
          {disabledReason}
        </TooltipContent>
      </Tooltip>
      <DisabledReason id={reasonId} reason={disabledReason} />
    </>
  )
}
