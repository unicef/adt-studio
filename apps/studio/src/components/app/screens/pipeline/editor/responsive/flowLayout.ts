import { componentOf } from "./componentLayout"
import { elementContainer } from "./elementContainer"

// Experiment: translate visual intent into normal-flow CSS. Never position nodes.
export function inspectFlow(element: HTMLElement) {
  const parent = element.parentElement!
  const style = getComputedStyle(element)
  const parentStyle = getComputedStyle(parent)
  const image = element.tagName === "IMG"
  const text = /^(P|H[1-6]|BLOCKQUOTE|LI|FIGCAPTION|SPAN|STRONG|EM|A)$/.test(element.tagName)
  const inline = style.display === "inline" && !image
  const row = parentStyle.display.includes("flex") && parentStyle.flexDirection !== "column"
  const grid = parentStyle.display.includes("grid")
  const table = style.display.includes("table") || parentStyle.display.includes("table")
  const mixed = Array.from(parent.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())
  let transformed = false
  for (let ancestor: HTMLElement | null = element; ancestor && !ancestor.classList.contains("adt-canvas"); ancestor = ancestor.parentElement) {
    const css = getComputedStyle(ancestor)
    if (css.transform !== "none" || (css.rotate && css.rotate !== "none") || (css.scale && css.scale !== "none")) transformed = true
  }
  const constrainedLayout = table || transformed || style.writingMode !== "horizontal-tb"
    || parentStyle.writingMode !== "horizontal-tb" || style.float !== "none"
    || ["absolute", "fixed", "sticky"].includes(style.position)
    || style.display === "contents" || parentStyle.display === "contents"
  const constrained = constrainedLayout || (image && mixed)
  const parentWidth = parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight)
  const siblings = Array.from(parent.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child.hasAttribute("data-adt-id"))
  // Inline siblings stay together as prose targets. CSS-reordered or positioned
  // siblings do not have a reliable top-to-bottom insertion order.
  const ordered = siblings.every(child => {
    const css = getComputedStyle(child)
    return css.order === "0" && css.display !== "contents" && css.float === "none"
      && !["absolute", "fixed", "sticky"].includes(css.position)
  })
  return {
    parent, parentWidth, siblings, image, text, grid, row, inline, constrained, constrainedLayout, display: style.display,
    canAlign: !constrained && !inline && (text || !row),
    canResize: !constrained && !inline && !row && !grid && parentWidth > 0,
    canSpace: !constrained && !inline && !row && !grid,
    canReorder: !constrained && !style.display.startsWith("inline") && !row && !grid && ordered && (siblings.length > 1 || mixed),
  }
}

export function inspectImageContainer(element: HTMLElement) {
  const flow = inspectFlow(element)
  const parent = flow.parent
  const onlyImage = flow.image && !flow.constrainedLayout && /^(DIV|P|FIGURE)$/.test(parent.tagName)
    && parent.hasAttribute("data-adt-id") && parent.children.length === 1
    && !Array.from(parent.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())
  // Keep an image-only block together when reordering; alignment still acts inside it.
  const grouped = flow.image && !flow.constrainedLayout ? componentOf(element) : element
  const resizeContainer = parent.hasAttribute("data-responsive-container") && parent.children.length === 1
  const orderElement = onlyImage || resizeContainer ? parent : grouped
  const orderFlow = orderElement !== element ? inspectFlow(orderElement) : flow
  const canWrap = !onlyImage && grouped === element && !!elementContainer(element, flow)
  return { flow, orderElement, orderFlow, canWrap }
}

export function alignmentStyle(flow: ReturnType<typeof inspectFlow>, alignment: "left" | "center" | "right") {
  if (flow.text) return { "text-align": alignment }
  // Blockify inline boxes so auto margins work, preserving their inner layout.
  // A flex/grid container's own display must survive an alignment gesture.
  const display = flow.display === "inline-flex" ? "flex" : flow.display === "inline-grid" ? "grid"
    : flow.image || flow.display === "inline-block" ? "block" : undefined
  // Physical margins also work in RTL and column flexboxes, without changing siblings.
  return {
    "margin-left": alignment === "left" ? "0px" : "auto",
    "margin-right": alignment === "right" ? "0px" : "auto",
    ...(flow.grid ? { "justify-self": alignment } : {}),
    ...(display ? { display } : {}),
  }
}

export function widthStyle(flow: ReturnType<typeof inspectFlow>, percentage: number) {
  return {
    width: `${Math.max(10, Math.min(100, Math.round(percentage)))}%`,
    "max-width": "100%",
    "min-width": "0px",
    "box-sizing": "border-box",
    ...(flow.image ? { height: "auto", "min-height": "0px", "max-height": "none", display: "block" } : {}),
  }
}

export function mergedStyle(original: string | null, patch: Record<string, string | undefined>) {
  const style = document.createElement("div").style
  style.cssText = original ?? ""
  for (const [property, value] of Object.entries(patch)) {
    if (value !== undefined) style.setProperty(property, value)
  }
  return style.cssText
}
