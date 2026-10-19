import { movableComponent } from "./componentLayout"
import type { inspectFlow } from "./flowLayout"

// A container supplies a normal-flow sizing area without dismantling the
// component. In a row it takes the available space; in a grid it fills one cell.
// Do not offer this escape hatch for diagrams or HTML with restricted children.
export function elementContainer(element: HTMLElement, flow: ReturnType<typeof inspectFlow>) {
  const parent = flow.parent
  if (element.hasAttribute("data-responsive-container") || parent.hasAttribute("data-responsive-container")
    || !(parent.classList.contains("adt-canvas") || /^(DIV|SECTION|ARTICLE|MAIN|ASIDE|HEADER|FOOTER|NAV|BLOCKQUOTE)$/.test(parent.tagName))
    || !movableComponent(element, true) || flow.constrainedLayout
    || flow.display === "none" || (flow.inline && !flow.image)) return null
  const parentStyle = getComputedStyle(parent)
  if (parentStyle.display.startsWith("inline") || parentStyle.flexDirection.endsWith("reverse")) return null
  if ([...element.querySelectorAll<HTMLElement>("*")].some(child => {
    const css = getComputedStyle(child)
    return ["absolute", "fixed", "sticky"].includes(css.position) || css.transform !== "none"
      || (css.rotate && css.rotate !== "none") || (css.scale && css.scale !== "none")
  })) return null
  const slot = flow.row || flow.grid
  if (slot && Array.from(parent.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) return null
  const style = getComputedStyle(element)
  if (flow.grid && [style.gridColumnStart, style.gridColumnEnd, style.gridRowStart, style.gridRowEnd].some(value => value !== "auto")) return null
  // Flex wrapping and CSS ordering need a deliberate parent-layout change.
  if (flow.row && (parentStyle.flexWrap !== "nowrap" || flow.siblings.some(child => {
    const css = getComputedStyle(child)
    return css.order !== "0" || ["absolute", "fixed", "sticky"].includes(css.position)
  }))) return null
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || flow.parentWidth <= 0) return null
  const parentRect = parent.getBoundingClientRect()
  const left = rect.left - parentRect.left - parseFloat(parentStyle.paddingLeft)
  const right = parentRect.right - rect.right - parseFloat(parentStyle.paddingRight)
  const end = parentStyle.direction === "rtl" ? "left" : "right"
  const start = parentStyle.direction === "rtl" ? "right" : "left"
  const alignment = flow.row ? (Math.abs(left - right) < 2 ? "center" : left > right ? "right" : "left")
    : style.justifySelf === "center" ? "center" : style.justifySelf === "end" ? end
      : style.justifySelf === "left" || style.justifySelf === "right" ? style.justifySelf : start
  return { slot, row: flow.row, width: Math.round(rect.width * 100) / 100, alignment, alignSelf: style.alignSelf }
}
