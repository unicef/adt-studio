/**
 * Returns true when an event target represents an element that is currently
 * receiving user typing input — used to suppress global keyboard shortcuts
 * (e.g. ArrowLeft/Right for page nav) while the user is editing text or
 * navigating a focused form control.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  // Quiz option labels intentionally handle only Enter/Space. Their native
  // radios are removed from the tab order so ArrowLeft/ArrowRight can keep
  // turning pages in the reader while an answer remains focused.
  if (target.closest(".activity-option[role='radio']")) return false
  // Other activity items may own richer keyboard interactions.
  if (target.closest("[data-activity-item]")) return true
  return false
}
