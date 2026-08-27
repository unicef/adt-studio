import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useFitScale } from "./useFitScale"

/**
 * The design box every export candidate is drawn inside, scaled to the slot as one unit.
 *
 * `aria-hidden` lives here rather than on each variant: none of this artwork carries information a
 * screen reader has any use for, the run screen's status text does, and there is no text anywhere
 * inside it — the step ships in five locales and a drawing that needs a caption is a drawing that
 * needs translating.
 */
export function FitBox({
  width,
  height,
  className,
  children,
}: {
  width: number
  height: number
  className?: string
  children: ReactNode
}) {
  const { ref, scale } = useFitScale(width, height)

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("relative flex h-full w-full items-center justify-center", className)}
    >
      <div className="relative shrink-0" style={{ width, height, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

/**
 * A real page render, cropped to its head.
 *
 * `object-position: top` rather than centre because the top of a picture-book page is where the
 * illustration and the heading are; centre-cropping a portrait render at 84×112 lands in the
 * middle of a text block, and a text block at that size is grey noise.
 *
 * `half` crops one page back out of a spread book's merged render: the image is drawn at twice the
 * box's width and the box's own `overflow: hidden` does the cutting. Both halves reference the
 * same cached image, so a spread costs one fetch however many leaves it becomes.
 */
export function PageFace({
  src,
  half,
  className,
  style,
}: {
  src: string
  half?: "left" | "right"
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <img
      src={src}
      alt=""
      decoding="async"
      draggable={false}
      className={cn("absolute inset-0 h-full w-full object-cover object-top", className)}
      style={half ? { width: "200%", left: half === "right" ? "-100%" : 0, ...style } : style}
    />
  )
}
