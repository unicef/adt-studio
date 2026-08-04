import { useCallback, useRef } from "react"
import { Popover, PopoverContent } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"

/** Matches the pin's `h-7 w-7`, so the popover clears the pin instead of
 *  covering the number the reviewer just clicked. */
const PIN_SIZE = 28

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface PointPopoverProps {
  /** Viewport point the surface should hang off — a pin, or a fresh click. */
  point: { x: number; y: number }
  open: boolean
  onClose: () => void
  ariaLabel: string
  /**
   * Keep Tab inside the surface. Used for the composer: half-written feedback
   * behind a reviewer who has tabbed back into the book is feedback that gets
   * lost.
   */
  trapFocus?: boolean
  /** Where focus goes when the surface closes — normally the pin it hangs off. */
  finalFocus?: React.RefObject<HTMLElement | null>
  /**
   * Focus the surface itself on open instead of its first control. A thread's
   * first control is the quiet "⋯" actions button, and landing a reviewer there
   * announces "comment actions" before they have heard the comment.
   */
  focusSurfaceOnOpen?: boolean
  /**
   * Extra room to keep clear on the right, so a thread does not open on top of
   * the comments sidebar — Base UI only avoids the viewport edges, and it cannot
   * know that a panel of ours is sitting there.
   */
  rightInset?: number
  className?: string
  children: React.ReactNode
}

/**
 * A popover anchored to a bare viewport point instead of a DOM node. The
 * virtual anchor reads through a ref, so Base UI's own scroll/resize tracking
 * keeps the surface glued to a pin that is moving with the content underneath.
 *
 * The focus trap is hand-rolled rather than Base UI's `modal`: modal popovers
 * block the page underneath, and a reviewer must be able to keep scrolling the
 * book while a thread is open.
 */
export function PointPopover({
  point,
  open,
  onClose,
  ariaLabel,
  trapFocus = false,
  finalFocus,
  focusSurfaceOnOpen = false,
  rightInset = 0,
  className,
  children,
}: PointPopoverProps) {
  const pointRef = useRef(point)
  pointRef.current = point

  const popupRef = useRef<HTMLDivElement>(null)

  const anchorRef = useRef({
    getBoundingClientRect: () => {
      const { x, y } = pointRef.current
      return new DOMRect(x, y - PIN_SIZE, PIN_SIZE, PIN_SIZE)
    },
  })

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!trapFocus || event.key !== "Tab") return
      const popup = popupRef.current
      if (!popup) return
      const focusable = Array.from(popup.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !popup.contains(active))) {
        event.preventDefault()
        last.focus()
        return
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [trapFocus],
  )

  return (
    <Popover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverContent
        ref={popupRef}
        side="right"
        align="start"
        sideOffset={14}
        positionMethod="fixed"
        anchor={() => anchorRef.current}
        collisionPadding={{ top: 8, bottom: 8, left: 8, right: 8 + rightInset }}
        role="dialog"
        aria-label={ariaLabel}
        tabIndex={-1}
        initialFocus={focusSurfaceOnOpen ? popupRef : undefined}
        finalFocus={finalFocus}
        onKeyDown={onKeyDown}
        className={cn("w-80 max-w-[calc(100vw-2rem)] gap-2 p-3", className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
