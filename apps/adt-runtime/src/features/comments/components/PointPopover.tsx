import { useRef } from "react"
import { Popover, PopoverContent } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"

/** Matches the pin's `h-7 w-7`, so the popover clears the pin instead of
 *  covering the number the reviewer just clicked. */
const PIN_SIZE = 28

export interface PointPopoverProps {
  /** Viewport point the surface should hang off — a pin, or a fresh click. */
  point: { x: number; y: number }
  open: boolean
  onClose: () => void
  ariaLabel: string
  className?: string
  children: React.ReactNode
}

/**
 * A popover anchored to a bare viewport point instead of a DOM node. The
 * virtual anchor reads through a ref, so Base UI's own scroll/resize tracking
 * keeps the surface glued to a pin that is moving with the content underneath.
 */
export function PointPopover({
  point,
  open,
  onClose,
  ariaLabel,
  className,
  children,
}: PointPopoverProps) {
  const pointRef = useRef(point)
  pointRef.current = point

  const anchorRef = useRef({
    getBoundingClientRect: () => {
      const { x, y } = pointRef.current
      return new DOMRect(x, y - PIN_SIZE, PIN_SIZE, PIN_SIZE)
    },
  })

  return (
    <Popover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={14}
        positionMethod="fixed"
        anchor={() => anchorRef.current}
        role="dialog"
        aria-label={ariaLabel}
        className={cn("w-80 max-w-[calc(100vw-2rem)] gap-2 p-3", className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
