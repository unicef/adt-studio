/* eslint-disable lingui/no-unlocalized-strings -- CSS values and selectors, never shown */
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { effectsReduced } from "@/lib/effects"

/** Where a picked answer was on screen when it was tapped, waiting for its reply bubble to mount. */
const flights = new Map<string, { rect: DOMRect; at: number }>()

/** Remembers where the tapped answer is, so the reply bubble can start its move from there. */
export function launch(key: string, el: Element | null) {
  if (el) flights.set(key, { rect: el.getBoundingClientRect(), at: Date.now() })
}


/**
 * The user's reply that grew out of the answer they tapped (d19): on mount, the bubble starts at
 * the tapped answer's place and size and moves into its own (a FLIP move), so the choice visibly
 * becomes their message. Without a fresh tap (reload, Reduce effects), it shows as usual.
 */
export function FlyIn({ flight, children }: { flight: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const from = flights.get(flight)
    flights.delete(flight)
    const bubble = ref.current?.closest<HTMLElement>(".lc-you")
    if (!from || !bubble || Date.now() - from.at > 1500 || effectsReduced()) return
    const to = bubble.getBoundingClientRect()
    if (!to.width || !to.height) return
    const dx = from.rect.left - to.left
    const dy = from.rect.top - to.top
    const sx = from.rect.width / to.width
    const sy = from.rect.height / to.height
    // The bubble's own entrance would fight the move.
    bubble.style.animation = "none"
    const css = getComputedStyle(bubble)
    const end = { bg: css.backgroundColor, ink: css.color }
    const start = getComputedStyle(document.documentElement)
    const card = start.getPropertyValue("--card").trim() || "white"
    const ink = start.getPropertyValue("--foreground").trim() || "black"
    // Not cancelled on cleanup: a second effect run (Strict Mode) finds no flight and leaves it be.
    bubble.animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, backgroundColor: card, color: ink, borderRadius: "16px", offset: 0 },
        { transformOrigin: "top left", backgroundColor: end.bg, color: end.ink, offset: 0.45 },
        { transformOrigin: "top left", transform: "none", backgroundColor: end.bg, color: end.ink, borderRadius: css.borderRadius },
      ],
      { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
  }, [flight])
  return (
    <span ref={ref} className="contents">
      {children}
    </span>
  )
}
