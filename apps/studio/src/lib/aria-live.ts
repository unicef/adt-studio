/**
 * Push a message to a singleton `#sr-announcement` live region.
 *
 * Ported from the ADT runtime's `shared/lib/aria-live.ts`. Reordering is the
 * first Studio interaction whose result is purely positional — a sighted user
 * sees the row move, so a screen-reader user needs to be told.
 */

let region: HTMLElement | null = null
let pendingAnnounce: ReturnType<typeof setTimeout> | null = null

function ensureRegion(): HTMLElement {
  // A cached region can be detached when the surrounding DOM is replaced;
  // announcements to a detached node are silently lost, so re-resolve.
  if (region && region.isConnected) return region
  region = null
  const existing = document.getElementById("sr-announcement")
  if (existing) {
    region = existing
    return region
  }
  const el = document.createElement("div")
  el.id = "sr-announcement"
  el.setAttribute("role", "status")
  el.setAttribute("aria-live", "polite")
  el.classList.add("sr-only")
  document.body.appendChild(el)
  region = el
  return el
}

export function announceToScreenReader(
  message: string,
  options: { assertive?: boolean } = {},
): void {
  if (typeof document === "undefined") return
  const el = ensureRegion()
  el.setAttribute("aria-live", options.assertive ? "assertive" : "polite")
  // Cancel any in-flight announcement first: without this a rapid second call
  // clears the text before the first timeout fires, letting the stale message
  // land last.
  if (pendingAnnounce !== null) {
    clearTimeout(pendingAnnounce)
    pendingAnnounce = null
  }
  // Clearing first guarantees the change is registered even when the message
  // is identical to the previous one.
  el.textContent = ""
  pendingAnnounce = setTimeout(() => {
    el.textContent = message
    pendingAnnounce = null
  }, 50)
}
