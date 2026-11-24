/* eslint-disable lingui/no-unlocalized-strings -- CSS selectors, easings and element ids, never shown */
/**
 * Idea A2 "The composer text becomes the bubble": where the thing the user sent was a moment ago
 * (the drop zone for the PDF, the name field for "Create …"), so the user's bubble can fly out of it.
 */

export type HandoffKind = "pdf" | "name"

type Handoff = { kind: HandoffKind; rect: DOMRect; at: number }

let pending: Handoff | null = null

/** The place the next user bubble of this kind should come from. */
export function rememberHandoff(kind: HandoffKind, rect: DOMRect) {
  if (rect.width > 0 && rect.height > 0) pending = { kind, rect, at: performance.now() }
}

/** Takes the remembered place, if it is recent enough to belong to the bubble that just arrived. */
export function takeHandoff(kind: HandoffKind, maxAge = 2500): DOMRect | null {
  const p = pending
  if (!p || p.kind !== kind || performance.now() - p.at > maxAge) return null
  pending = null
  return p.rect
}

const EASE = "cubic-bezier(0.32, 1.25, 0.5, 1)"

/**
 * Flies `el` from `from` to where it is now (FLIP). The PDF card keeps its look and shrinks out of
 * the drop zone; a text bubble starts as plain text in the field and takes its colour on the way.
 */
export function flyFrom(el: HTMLElement, from: DOMRect, kind: HandoffKind) {
  const to = el.getBoundingClientRect()
  if (!to.width || !to.height) return
  el.style.animation = "none"
  // Inside a CSS-zoomed row, translate() is zoomed too.
  const zoom = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1
  if (kind === "pdf") {
    const scale = Math.min(1, Math.max(0.35, from.height / to.height))
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) / zoom
    const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / zoom
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.5, transformOrigin: "center" },
        { opacity: 1, offset: 0.35 },
        { transform: "none", opacity: 1, transformOrigin: "center" },
      ],
      { duration: 620, easing: EASE },
    )
    return
  }
  const style = getComputedStyle(el)
  const ink = getComputedStyle(document.body).color
  const dx = (from.left + 12 - to.left) / zoom
  const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / zoom
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)`, backgroundColor: "transparent", color: ink, boxShadow: "none" },
      { backgroundColor: "transparent", color: ink, boxShadow: "none", offset: 0.15 },
      { transform: "none", backgroundColor: style.backgroundColor, color: style.color, boxShadow: style.boxShadow },
    ],
    { duration: 600, easing: EASE },
  )
}
