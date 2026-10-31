import { useEffect, useRef, type RefObject } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { CommentThread } from "./CommentThread"
import { isPlaced, type CommentPin, type SectionComments } from "./use-section-comments"

const CARD_WIDTH = 320
/** Room kept for the card's height when it has to sit near the preview's bottom edge. */
const CARD_HEIGHT = 340
const GAP = 18
const EDGE = 8

/**
 * The open comment, as a card beside its pin. It sits to the pin's right, or its left when the
 * right has no room, and below the pin when neither side has — never past the preview's edges, so
 * the pin and the thing it points at stay in view and nothing is cut off. It takes focus when it
 * opens and Escape closes it.
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
  const cardRef = useRef<HTMLDivElement>(null)
  const width = containerRef.current?.clientWidth ?? 0
  const height = containerRef.current?.clientHeight ?? 0
  const style = isPlaced(pin) ? placeBeside(pin.x, pin.y, width, height) : undefined
  const threadId = pin.thread.root.id

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
  }, [threadId])

  return (
    <div
      ref={cardRef}
      role="dialog"
      tabIndex={-1}
      aria-label={t`Comment from ${pin.thread.root.author_name}`}
      data-testid="storyboard-thread-card"
      style={style}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          comments.select(null)
        }
      }}
      className={cn(
        "pointer-events-auto z-40 w-80 max-w-[calc(100%-1rem)] rounded-xl border bg-popover p-3 shadow-xl outline-none",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
        isPlaced(pin) ? "absolute" : "relative",
      )}
    >
      <CommentThread pin={pin} comments={comments} onClose={() => comments.select(null)} />
    </div>
  )
}

function placeBeside(x: number, y: number, width: number, height: number) {
  const maxLeft = Math.max(EDGE, width - EDGE - CARD_WIDTH)
  const clampTop = (top: number) => Math.max(EDGE, Math.min(top, Math.max(EDGE, height - EDGE - CARD_HEIGHT)))
  if (x + GAP + CARD_WIDTH <= width - EDGE) return { left: x + GAP, top: clampTop(y - 32) }
  if (x - GAP - CARD_WIDTH >= EDGE) return { left: x - GAP - CARD_WIDTH, top: clampTop(y - 32) }
  /** Too narrow for either side: centred under the pin, so it still doesn't cover it. */
  return { left: Math.min(maxLeft, Math.max(EDGE, x - CARD_WIDTH / 2)), top: clampTop(y + GAP) }
}
