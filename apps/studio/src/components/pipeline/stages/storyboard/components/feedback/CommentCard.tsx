import type { RefObject } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { CommentThread } from "./CommentThread"
import { isPlaced, type CommentPin, type SectionComments } from "./use-section-comments"

const CARD_WIDTH = 320
const GAP = 18
const EDGE = 8

/**
 * The open comment, as a card beside its pin. It sits to the pin's right, or its left when the
 * right has no room, and never past the preview's edges — so neither the pin nor the thing it
 * points at is covered, and nothing is cut off.
 */
export function CommentCard({
  pin,
  comments,
  containerRef,
}: {
  pin: CommentPin
  comments: SectionComments
  containerRef: RefObject<HTMLElement | null>
}) {
  const { t } = useLingui()
  const width = containerRef.current?.clientWidth ?? 0
  const style = isPlaced(pin) ? placeBeside(pin.x, pin.y, width) : undefined

  return (
    <div
      role="dialog"
      aria-label={t`Comment from ${pin.thread.root.author_name}`}
      data-testid="storyboard-thread-card"
      style={style}
      className={cn(
        "pointer-events-auto z-30 w-80 max-w-[calc(100%-1rem)] rounded-xl border bg-popover p-3 shadow-xl",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
        isPlaced(pin) ? "absolute" : "relative",
      )}
    >
      <CommentThread pin={pin} comments={comments} onClose={() => comments.select(null)} />
    </div>
  )
}

function placeBeside(x: number, y: number, width: number) {
  const fitsRight = x + GAP + CARD_WIDTH <= width - EDGE
  const left = fitsRight ? x + GAP : Math.max(EDGE, x - GAP - CARD_WIDTH)
  return { left, top: Math.max(EDGE, y - 32) }
}
