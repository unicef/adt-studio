/**
 * Push a message to a singleton `#sr-announcement` live region. The legacy
 * runtime did the same thing in `ui_utils.js:announceToScreenReader`. Used by
 * activity validators to narrate the overall result ("3 blanks remaining…").
 */

let region: HTMLElement | null = null
let pendingAnnounce: ReturnType<typeof setTimeout> | null = null

function ensureRegion(): HTMLElement {
  // A cached region can be detached when the surrounding DOM is replaced
  // (page swap in the SPA shell); announcements to a detached node are
  // silently lost, so re-resolve or re-create in that case.
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
  // Cancel any in-flight announcement first. Without this, a rapid second call
  // would clear the textContent before the first call's setTimeout fires,
  // letting the first announcement land AFTER the second clear and overwrite
  // it — the user hears a stale message.
  if (pendingAnnounce !== null) {
    clearTimeout(pendingAnnounce)
    pendingAnnounce = null
  }
  // Clearing first guarantees screen readers register the change even when the
  // message is identical to the previous announcement.
  el.textContent = ""
  pendingAnnounce = setTimeout(() => {
    el.textContent = message
    pendingAnnounce = null
  }, 50)
}
