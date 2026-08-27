import { useState } from "react"
import { cn } from "@/lib/utils"

/**
 * A cover or a page, real when the book has renders and drawn when it does not.
 *
 * The fallback is deliberately not an outlined book icon at 90px. Scaled-up icon art is the defect
 * that made four earlier attempts read as clip-art: a 1.6px stroke from a 24px grid renders at
 * eight or nine pixels of visual weight while keeping icon-grid proportions, and the eye reads the
 * proportions, not the size. So the fallback is a *sheet* — paper tone, a spine, a bleed of colour
 * where a picture book's illustration lives — built from gradients with no strokes at all. It reads
 * as an object of the right kind at every slot size because it has no fixed detail to outgrow.
 */
export function Leaf({
  src,
  half,
  kind,
  seed = 0,
  className,
}: {
  src?: string
  /** One page cropped back out of a spread book's merged render. The image draws at twice the
   *  leaf's width and the leaf wrapper's `overflow: hidden` does the cutting; both halves hit the
   *  same cached image. */
  half?: "left" | "right"
  kind: "cover" | "page"
  /**
   * Which drawn page layout to use when there is no render.
   *
   * Not cosmetic. With one layout, a verso and its recto render *identically* and an open spread
   * reads as a single undivided sheet for any book with no thumbnails — which is the one thing the
   * open book exists to show. Three layouts is enough for adjacent surfaces to differ.
   */
  seed?: 0 | 1 | 2
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        decoding="async"
        onError={() => setFailed(true)}
        className={cn("pubreg-leaf", className)}
        style={half ? { width: "200%", marginLeft: half === "right" ? "-100%" : 0 } : undefined}
      />
    )
  }

  return (
    <span
      data-seed={kind === "page" ? seed : undefined}
      className={cn(
        "pubreg-leaf",
        kind === "cover" ? "pubreg-leaf--cover" : "pubreg-leaf--page",
        className,
      )}
    />
  )
}
