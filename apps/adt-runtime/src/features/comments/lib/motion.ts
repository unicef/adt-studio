/**
 * Reduced motion for the one animation CSS cannot own: `scrollIntoView`.
 *
 * `behavior: "smooth"` is a script argument, so the global
 * `body[reduce-motion="true"]` rule and the `motion-reduce:` variants that cover
 * every other animation in this feature cannot reach it. Both signals are read
 * here — the reader's explicit setting and the OS preference — because a reader
 * who asked for stillness in the book's own settings means it for jumps too.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  if (document.body.getAttribute("reduce-motion") === "true") return true
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth"
}
