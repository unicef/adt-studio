import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"
import { useDockContext } from "@/features/dock/context/dock-context"

export interface DockIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel: string
  /** Override tooltip text; defaults to `ariaLabel`. */
  tooltip?: string
  pressed?: boolean
  size?: "sm" | "default"
  ref?: React.Ref<HTMLButtonElement>
  /** Text shown beside the icon when the book's button style asks for it; defaults to `ariaLabel`. */
  label?: string
  /** Put the icon after the text (e.g. "Next →"). */
  iconPosition?: "start" | "end"
}

/**
 * Icon-only dock control. Every instance gets:
 *
 *   - `aria-label`   — required, for screen readers
 *   - `title`        — native browser tooltip + fallback for any SR that
 *                      prefers it
 *   - shadcn Tooltip — visible, styled tooltip on hover/focus
 *
 * The tooltip side follows the dock position: docks on the bottom open
 * their tooltips upward; docks on the top open them downward.
 *
 * A book's reader design (`readerUi.layout.button_style`, Studio Reader step)
 * can show the name next to the icon, or the name alone. On a vertical rail
 * the name stacks under the icon. Small (`sm`) buttons stay icon-only.
 */
export function DockIconButton({
  ariaLabel,
  tooltip,
  pressed,
  size = "default",
  className,
  children,
  ref,
  label: visibleLabel,
  iconPosition = "start",
  ...props
}: DockIconButtonProps) {
  const { popoverSide, buttonStyle, isVertical } = useDockContext()
  const label = tooltip ?? ariaLabel
  const style = size === "sm" ? "icon" : buttonStyle
  const showIcon = style !== "label"
  const showText = style !== "icon"
  const text = visibleLabel ?? ariaLabel
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={ref}
            type="button"
            aria-label={ariaLabel}
            title={label}
            aria-pressed={pressed}
            data-dock-trigger=""
            className={cn(
              "rounded-lg flex items-center justify-center shrink-0",
              "text-popover-foreground/80 hover:bg-accent hover:text-accent-foreground",
              "transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-30 disabled:hover:bg-transparent",
              "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
              "aria-pressed:bg-accent aria-pressed:text-accent-foreground",
              size === "sm"
                ? "h-7 w-7"
                : !showText
                  ? "h-11 w-11"
                  : isVertical
                    ? "min-h-11 w-full min-w-14 max-w-20 flex-col gap-0.5 px-1 py-1.5 text-[11px] leading-tight"
                    : "h-11 gap-2 px-3 text-sm font-medium",
              className,
            )}
            {...props}
          >
            {showIcon && iconPosition === "start" ? children : null}
            {showText ? (
              <span className={cn("min-w-0", isVertical ? "text-center break-words" : "truncate")}>{text}</span>
            ) : null}
            {showIcon && iconPosition === "end" ? children : null}
          </button>
        }
      />
      <TooltipContent side={popoverSide}>{label}</TooltipContent>
    </Tooltip>
  )
}
