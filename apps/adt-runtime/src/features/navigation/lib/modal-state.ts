const OPEN_MODAL_SELECTOR = [
  // Radix dialogs and poppers.
  '[role="dialog"][data-state="open"]',
  "[data-radix-popper-content-wrapper]",
  // Current Base UI popups use `data-open`. Dock panels are handled by
  // `dockMenuValueAtom`; excluding their outer popup lets the audio panel
  // keep page navigation enabled while still blocking its nested controls.
  '[role="dialog"][data-open]:not([data-dock-panel])',
  '[role="menu"][data-open]',
  // Compatibility with older Base UI popper markup.
  "[data-base-ui-popper-content-wrapper]",
].join(", ")

export function isAnyModalOpen(): boolean {
  if (typeof document === "undefined") return false
  return Boolean(document.querySelector(OPEN_MODAL_SELECTOR))
}
