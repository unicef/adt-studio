import { cn } from "@/shared/lib/utils"
import { readableTextColor } from "@/features/comments/lib/color"

export interface CommentPinProps {
  /** Viewport coordinates of the anchored point. */
  x: number
  y: number
  color: string
  label: string
  ariaLabel: string
  /** Pins the reader owns read slightly heavier than everyone else's. */
  own?: boolean
  open?: boolean
  draft?: boolean
  onClick?: () => void
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * A Figma-style pin: a circle with one squared corner that sits *on* the point
 * it comments about, so the tail is the anchor and the bubble never covers it.
 */
export function CommentPin({
  x,
  y,
  color,
  label,
  ariaLabel,
  own = false,
  open = false,
  draft = false,
  onClick,
  ref,
}: CommentPinProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={open}
      data-comment-pin=""
      onClick={onClick}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: color,
        color: readableTextColor(color),
      }}
      className={cn(
        "pointer-events-auto absolute flex h-7 w-7 -translate-y-full items-center justify-center",
        "rounded-full rounded-bl-none text-[0.7rem] font-bold leading-none",
        "shadow-md ring-2 transition-all duration-200 ease-out",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-ring",
        own ? "ring-white" : "ring-white/60",
        open ? "scale-110 shadow-lg" : "hover:scale-110 hover:shadow-lg",
        draft
          ? "animate-pulse ring-white"
          : "duration-200 animate-in fade-in-0 zoom-in-50",
      )}
    >
      {label}
    </button>
  )
}
