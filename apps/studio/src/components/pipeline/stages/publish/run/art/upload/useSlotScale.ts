import { useEffect, useRef, useState } from "react"
import { clamp } from "./upload-common"

/**
 * Fits a fixed composition into whatever slot it is given.
 *
 * The alternative — laying every variant out responsively — sounds better and is worse here. These
 * are drawings whose depth is baked: a parallax authored against one window, a threshold whose
 * spill is measured against the book's own travel. Re-deriving those at four different sizes would
 * mean four different illustrations, and the one that got the most attention would be the only
 * good one. So the composition is authored once and one `scale()` on one node fits it to the slot.
 *
 * `max` caps the growth: a 400-wide composition blown up further gains nothing and loses crispness
 * on its baked gradients. `mode: "cover"` is for a variant whose subject is an *atmosphere* rather
 * than an object — a sky reads better cropped than miniaturised, and a sky that stops short of the
 * frame with white on either side reads as a photograph of a sky. An object gets `fit`.
 */
export function useSlotScale(
  design: { width: number; height: number },
  {
    min = 0,
    max = 1.25,
    mode = "fit",
  }: { min?: number; max?: number; mode?: "fit" | "cover" } = {},
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (!box || box.width === 0) return
      const ratios = [box.width / design.width, box.height / design.height]
      setScale(clamp(mode === "cover" ? Math.max(...ratios) : Math.min(...ratios), min, max))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [design.width, design.height, min, max, mode])

  return { ref, scale }
}
