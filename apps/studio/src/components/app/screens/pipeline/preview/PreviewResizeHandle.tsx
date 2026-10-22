import type { KeyboardEvent, PointerEvent } from "react"
import { cn } from "@/lib/utils"

export type ResizeEdge = "left" | "right" | "bottom"

export interface PreviewResizeHandleProps {
  edge: ResizeEdge
  label: string
  value: number
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: () => void
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

const EDGE_CLASS: Record<ResizeEdge, string> = {
  left: "-left-5 top-1/2 h-16 w-5 -translate-y-1/2 cursor-ew-resize",
  right: "-right-5 top-1/2 h-16 w-5 -translate-y-1/2 cursor-ew-resize",
  bottom: "-bottom-5 left-1/2 h-5 w-16 -translate-x-1/2 cursor-ns-resize",
}

export function PreviewResizeHandle({
  edge,
  label,
  value,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: PreviewResizeHandleProps) {
  const horizontal = edge === "bottom"

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute grid touch-none place-items-center outline-none",
        EDGE_CLASS[edge],
      )}
    >
      <span
        className={cn(
          "rounded-full bg-foreground/15 transition-colors group-hover:bg-foreground/35 group-focus-visible:bg-primary group-active:bg-foreground/45",
          horizontal ? "h-1 w-12" : "h-14 w-1",
        )}
      />
    </div>
  )
}
