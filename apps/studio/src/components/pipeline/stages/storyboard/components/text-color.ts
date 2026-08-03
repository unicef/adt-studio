const ORIGINAL_COLOR_MARKER = "data-adt-original-color"
const ORIGINAL_COLOR_VALUE = "data-adt-original-color-value"
const ORIGINAL_COLOR_PRIORITY = "data-adt-original-color-priority"
export const MANUAL_TEXT_COLOR_ATTRIBUTE = "data-adt-manual-text-color"

export interface ElementClassChangeOptions {
  removeAttributes?: readonly string[]
  setAttributes?: readonly string[]
}

// Preview-only inline styles must be reversible because the editor serializes
// the iframe DOM after class/style changes. Otherwise the runtime !important
// colors would leak into saved HTML and override later user edits.
function rememberOriginalColor(el: HTMLElement): void {
  if (el.hasAttribute(ORIGINAL_COLOR_MARKER)) return
  el.setAttribute(ORIGINAL_COLOR_MARKER, "")
  el.setAttribute(ORIGINAL_COLOR_VALUE, el.style.getPropertyValue("color"))
  el.setAttribute(
    ORIGINAL_COLOR_PRIORITY,
    el.style.getPropertyPriority("color"),
  )
}

export function restoreAppliedTextColors(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(`[${ORIGINAL_COLOR_MARKER}]`).forEach((el) => {
    const value = el.getAttribute(ORIGINAL_COLOR_VALUE) ?? ""
    const priority = el.getAttribute(ORIGINAL_COLOR_PRIORITY) ?? ""
    if (value) {
      el.style.setProperty("color", value, priority)
    } else {
      el.style.removeProperty("color")
    }
    el.removeAttribute(ORIGINAL_COLOR_MARKER)
    el.removeAttribute(ORIGINAL_COLOR_VALUE)
    el.removeAttribute(ORIGINAL_COLOR_PRIORITY)
  })
}

export function applyTextColors(doc: Document): void {
  const colorEls = doc.querySelectorAll<HTMLElement>("[data-text-color]")
  for (const el of colorEls) {
    const color = el.getAttribute("data-text-color")
    if (!color || el.hasAttribute(MANUAL_TEXT_COLOR_ATTRIBUTE)) continue
    rememberOriginalColor(el)
    el.style.setProperty("color", color, "important")
    const descendants = el.querySelectorAll<HTMLElement>("*")
    for (const descendant of descendants) {
      if (
        descendant.closest("[data-text-color]") === el &&
        !descendant.closest("a") &&
        !descendant.closest(`[${MANUAL_TEXT_COLOR_ATTRIBUTE}]`)
      ) {
        rememberOriginalColor(descendant)
        descendant.style.setProperty("color", "inherit", "important")
      }
    }
  }
}
