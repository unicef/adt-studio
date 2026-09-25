import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useSlotScale } from "./useSlotScale"

/**
 * The shell every upload candidate sits in: aria-hidden, stall-tagged, and scaled to the slot.
 *
 * `aria-hidden` is absolute here. The artwork carries no text in any of the five locales, and the
 * screen's real information — the count, the step name, the reassurance — is text elsewhere. An
 * illustration that a screen reader announces is noise on a four-minute screen.
 *
 * `data-stalled` is on the outermost node so a variant's stall handling can be a plain descendant
 * selector in CSS. It is the *only* thing about a stall the artwork is told; nothing below is
 * allowed to stop.
 */
export function UploadFrame({
  design,
  stalled,
  minScale = 0,
  maxScale = 1.25,
  mode = "fit",
  className,
  children,
}: {
  design: { width: number; height: number }
  stalled: boolean
  minScale?: number
  maxScale?: number
  mode?: "fit" | "cover"
  className?: string
  children: ReactNode
}) {
  const { ref, scale } = useSlotScale(design, { min: minScale, max: maxScale, mode })

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-stalled={stalled ? "" : undefined}
      className={cn("flex h-full w-full items-center justify-center", className)}
    >
      <div
        className="relative shrink-0"
        style={{ width: design.width, height: design.height, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
