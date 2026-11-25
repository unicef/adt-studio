/* eslint-disable lingui/no-unlocalized-strings -- CSS selectors, easings and element ids, never shown */
/**
 * Idea A2 "The composer text becomes the bubble": where the thing the user sent was a moment ago
 * (the drop zone for the PDF, the name field for "Create …"), so the user's bubble can fly out of it.
 */

export type HandoffKind = "pdf" | "name" | "text"

/** Marks the composer's surface, the place a reply with no other source flies out of. */
export const COMPOSER_ATTR = "data-lc-composer"

type Handoff = { kind: HandoffKind; rect: DOMRect; at: number }

let pending: Handoff | null = null

/** The place the next user bubble of this kind should come from. */
export function rememberHandoff(kind: HandoffKind, rect: DOMRect) {
  if (rect.width > 0 && rect.height > 0) pending = { kind, rect, at: performance.now() }
}

/**
 * Takes the remembered place, if it is recent enough to belong to the bubble that just arrived. A
 * reply (an answer, "Skip", "Try again", or a name with no remembered field) comes out of the
 * composer, like text typed there and sent.
 */
export function takeHandoff(kind: HandoffKind, maxAge = 2500): DOMRect | null {
  const p = pending
  if (p && p.kind === kind && performance.now() - p.at <= maxAge) {
    pending = null
    return p.rect
  }
  if (kind === "pdf") return null
  const composer = document.querySelector(`[${COMPOSER_ATTR}]`)?.getBoundingClientRect()
  return composer && composer.width ? composer : null
}

/** The composer's "send": a quick press as the text leaves it (the board's a2send). */
function pressComposer() {
  document.querySelector(`[${COMPOSER_ATTR}]`)?.animate([{ transform: "none" }, { transform: "scale(0.985)", offset: 0.35 }, { transform: "none" }], { duration: 260, easing: "ease-out" })
}

const EASE = "cubic-bezier(0.32, 1.25, 0.5, 1)"

/**
 * Flies `el` from `from` to where it is now (FLIP). The PDF card keeps its look and shrinks out of
 * the drop zone; a text bubble starts as plain text in the field (or the composer), rises, takes
 * its colour on the way and settles with a small bounce, as on the board.
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
  pressComposer()
  const style = getComputedStyle(el)
  const ink = getComputedStyle(document.body).color
  const dx = (from.left + 12 - to.left) / zoom
  const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) / zoom
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)`, backgroundColor: "transparent", color: ink, boxShadow: "none" },
      { transform: `translate(${dx}px, ${dy}px)`, backgroundColor: "transparent", color: ink, boxShadow: "none", offset: 0.08 },
      { transform: "none", backgroundColor: style.backgroundColor, color: style.color, boxShadow: style.boxShadow, offset: 0.75 },
      { transform: "translateY(-3px)", offset: 0.87 },
      { transform: "none", backgroundColor: style.backgroundColor, color: style.color, boxShadow: style.boxShadow },
    ],
    { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  )
}
