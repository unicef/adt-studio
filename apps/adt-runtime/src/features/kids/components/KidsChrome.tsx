/**
 * Minimal kids-mode chrome shell.
 *
 * Later steps will host the buddy and kids onboarding here. For now this
 * intentionally renders no visible UI while reserving a stable mount point.
 */
export function KidsChrome() {
  return (
    <div
      data-testid="kids-chrome"
      className="pointer-events-none fixed inset-0 z-[55]"
      aria-hidden="true"
    />
  )
}
