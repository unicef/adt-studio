import { useLayoutEffect } from "react"
import { mediaGroup } from "./componentLayout"
import type { useFlowSelection } from "./useFlowSelection"
import type { useFlowGestures } from "./useFlowGestures"
import type { useComponentLayout } from "./useComponentLayout"
import type { useArrangeGesture } from "./useArrangeGesture"

// Only a selected whole object opts into automatic placement. A child image or
// paragraph retains its own alignment even when Move would promote it to a figure.
export function prefersComponentMove(element: HTMLElement) {
  if (/^(ASIDE|FIGURE|HEADER|FOOTER)$/.test(element.tagName)) return true
  if (element.tagName !== "DIV") return false
  if (element.hasAttribute("data-responsive-container") || mediaGroup(element)) return true
  const css = getComputedStyle(element)
  return css.float !== "none" || css.backgroundImage !== "none"
    || !["transparent", "rgba(0, 0, 0, 0)"].includes(css.backgroundColor)
    || css.boxShadow !== "none"
    || [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth].some(width => parseFloat(width) > 0)
}

export function useDragRouting(selection: ReturnType<typeof useFlowSelection>, layout: ReturnType<typeof useComponentLayout>,
  arrange: ReturnType<typeof useArrangeGesture>, gestures: ReturnType<typeof useFlowGestures>, transforming = false) {
  const componentIntent = !!selection.geometry && prefersComponentMove(selection.geometry.element)
  const automatic = componentIntent && layout.canArrange
  useLayoutEffect(() => {
    const element = arrange.active ? layout.component : selection.geometry?.element
    if (!element || selection.editing || transforming) return
    const down = (event: PointerEvent) => {
      // A plain click still reaches the editor to select children or edit text.
      // Choose one gesture at pointer-down; never switch midway through a drag.
      if ((event.target as Element).closest('[contenteditable]:not([contenteditable="false"]),input,textarea,select,button,a,[role="button"]')) return
      // A protected whole component must not fall back to ordinary reordering.
      if (arrange.active || componentIntent) arrange.start(event, true)
      else gestures.start(event, "move")
    }
    // The library also installs native HTML dragging. It must not take over a
    // rejected gesture or pull an input/link out of a selected component.
    const blockNativeDrag = (event: Event) => { event.preventDefault(); event.stopPropagation() }
    element.addEventListener("pointerdown", down)
    element.addEventListener("dragstart", blockNativeDrag, true)
    return () => {
      element.removeEventListener("pointerdown", down)
      element.removeEventListener("dragstart", blockNativeDrag, true)
    }
  })
  return automatic
}
