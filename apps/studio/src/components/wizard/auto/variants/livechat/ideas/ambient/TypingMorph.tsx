/* eslint-disable lingui/no-unlocalized-strings -- CSS values, never shown */
import { useLayoutEffect, useState, type RefObject } from "react"
import { useReducedEffects } from "@/lib/effects"
import "./ambient.css"

const DOTS_W = 96
const DOTS_H = 58

/**
 * Idea G32 "Typing dots grow into the message": the assistant's bubble starts at the typing
 * bubble's size and opens to its own, while the dots fade and the words arrive. Decided once when
 * the bubble mounts, so its children never remount.
 */
export function useTypingMorph(bubble: RefObject<HTMLElement | null>, on: boolean) {
  const reduced = useReducedEffects()
  const [morph] = useState(() => on && !reduced)
  useLayoutEffect(() => {
    const el = bubble.current
    if (!morph || !el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (w <= DOTS_W && h <= DOTS_H) return
    const shape = "round 28px 28px 28px 8px"
    el.animate([{ clipPath: `inset(${Math.max(0, h - DOTS_H)}px ${Math.max(0, w - DOTS_W)}px 0 0 ${shape})` }, { clipPath: `inset(-2px -2px -2px -2px ${shape})` }], { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
  }, [])
  return morph
}

/** The typing dots, left in the bubble as it grows, fading out. */
export function MorphDots() {
  return (
    <span aria-hidden className="lc-g32-dots">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2.5 rounded-full bg-brand-500/70" />
      ))}
    </span>
  )
}
