/**
 * The keyboard equivalent of "click anywhere on the page".
 *
 * A pointer can aim at any pixel; a keyboard cannot, so the reviewer moves
 * between the same stable hooks the anchor engine already trusts
 * (`data-id` / `data-area-id` / `data-section-id`). Document order puts the
 * section wrapper first and then each chunk of content inside it, so arrowing
 * runs coarse → fine, and the first stop is a sensible page-level target.
 *
 * Pure with respect to the DOM it is handed, for the same reason as `anchor.ts`:
 * the root is a parameter, so this is testable against a fixture.
 */

export const CONTENT_TARGET_ATTRIBUTE = "data-comment-target"

const TARGET_SELECTOR = "[data-id], [data-area-id], [data-section-id]"

function hasBox(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

/**
 * Every element inside `root` a keyboard reviewer can pin a comment to.
 * Zero-box and `aria-hidden` elements are dropped: a pin the reviewer cannot
 * see is worse than one stop fewer.
 */
export function contentTargets(root: Element): Element[] {
  return Array.from(root.querySelectorAll(TARGET_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true" && hasBox(element),
  )
}

/** Index of `element` among the targets, or the nearest enclosing target's. */
export function targetIndexOf(targets: Element[], element: Element | null): number {
  if (!element) return -1
  const direct = targets.indexOf(element)
  if (direct !== -1) return direct
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    if (targets[index].contains(element)) return index
  }
  return -1
}

/** Wraps at both ends: the walker is a ring, so `End` is never a dead stop. */
export function stepTarget(targets: Element[], from: number, delta: number): number {
  if (targets.length === 0) return -1
  if (from === -1) return delta > 0 ? 0 : targets.length - 1
  return (from + delta + targets.length) % targets.length
}
