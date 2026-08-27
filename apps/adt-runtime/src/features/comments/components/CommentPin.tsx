import { Check } from "lucide-react"
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
  /** Closed by the author: muted, and the number gives way to a check. */
  resolved?: boolean
  /** A page-level thread's corner marker: present, but not competing with the
   *  pins that actually sit on content. The sidebar is where it is really read. */
  subtle?: boolean
  /** The pin the pointer is carrying. */
  dragging?: boolean
  /** …and the hole it left behind, still at the old anchor. */
  lifted?: boolean
  /** A drag currently over ground that cannot hold a pin. */
  invalid?: boolean
  settling?: boolean
  flashing?: boolean
  title?: string
  tabIndex?: number
  onClick?: () => void
  onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
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
  resolved = false,
  subtle = false,
  dragging = false,
  lifted = false,
  invalid = false,
  settling = false,
  flashing = false,
  title,
  tabIndex,
  onClick,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ref,
}: CommentPinProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={open}
      aria-hidden={dragging || undefined}
      title={title}
      tabIndex={dragging ? -1 : tabIndex}
      data-comment-pin=""
      data-dragging={dragging ? "" : undefined}
      data-resolved={resolved ? "" : undefined}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
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
        // A white ring inside a dark halo: a pin sits on book content of any
        // colour, so a single-colour focus ring cannot be relied on. The halo is a
        // shadow rather than an outline because `focus:outline-none` sets
        // Tailwind's outline-style variable to `none` for focus-visible too.
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-white",
        "focus-visible:shadow-[0_0_0_7px_rgba(23,23,23,0.8)]",
        "motion-reduce:transition-none",
        own ? "ring-white" : "ring-white/60",
        open ? "scale-110 shadow-lg" : "hover:scale-110 hover:shadow-lg",
        draft
          ? "animate-pulse ring-white motion-reduce:animate-none"
          : "duration-200 animate-in fade-in-0 zoom-in-50 motion-reduce:animate-none",
        resolved && "opacity-45 saturate-50 hover:opacity-90",
        subtle && !open && "scale-90 opacity-70 hover:opacity-100",
        onPointerDown && "cursor-grab touch-none select-none active:cursor-grabbing",
        dragging && "z-10 scale-115 cursor-grabbing shadow-xl ring-4 duration-75",
        invalid && "opacity-60 saturate-0",
        lifted && "scale-90 opacity-25 shadow-none",
        settling && "animate-comment-settle motion-reduce:animate-none",
        flashing && "animate-comment-flash motion-reduce:animate-none",
      )}
    >
      {resolved ? <Check aria-hidden className="h-3.5 w-3.5 stroke-[3]" /> : label}
    </button>
  )
}
