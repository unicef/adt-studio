import { componentOf, flowContainer, mediaGroup, movableComponent } from "./componentLayout"
import { surroundingTextFlow } from "./textFlow"

export function componentDrop(host: HTMLElement, moving: HTMLElement, x: number, y: number, floating = false) {
  const bounds = host.getBoundingClientRect()
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null
  const hit = document.elementFromPoint(x, y)
  let target = hit?.closest<HTMLElement>("[data-adt-id], .adt-canvas") ?? null
  if (!target || !host.contains(target)) return null
  target = componentOf(target)
  while (target && !movableComponent(target) && !target.classList.contains("adt-canvas")) target = target.parentElement?.closest<HTMLElement>("[data-adt-id], .adt-canvas") ?? null
  if (!target || !host.contains(target)) return null

  // Floats need to precede the text they wrap. A horizontal drag across the
  // current aside also works when its authored breakpoint has made it full-width.
  if (floating && moving.contains(target)) {
    const siblings = surroundingTextFlow(moving)?.texts ?? []
    target = siblings.find(el => !!(moving.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? siblings.at(-1) ?? null
    if (!target) return null
    const box = target.getBoundingClientRect()
    return { target, kind: x < box.left + box.width / 2 ? "float-left" as const : "float-right" as const, vertical: false, box }
  }
  if (moving.contains(target)) return null

  // Blank space belongs to its container. Resolve it to the nearest child so
  // dropping between blocks, beside a column or below the last block works.
  if (flowContainer(target) && !mediaGroup(target) && target.contains(moving)) {
    const candidates = Array.from(target.children).filter((el): el is HTMLElement => el instanceof HTMLElement
      && el !== moving && !el.contains(moving) && movableComponent(el) && getComputedStyle(el).display !== "none")
    if (getComputedStyle(target).display === "grid" && moving.parentElement !== target) {
      const column = candidates.find(el => {
        const box = el.getBoundingClientRect()
        return el.tagName === "DIV" && !mediaGroup(el) && x >= box.left && x <= box.right && y > box.bottom
      })
      if (column) {
        const box = column.getBoundingClientRect()
        return { target: column, kind: "inside" as const, vertical: false,
          box: new DOMRect(box.left, box.top, box.width, target.getBoundingClientRect().bottom - box.top) }
      }
    }
    const nearest = candidates.map(element => {
      const box = element.getBoundingClientRect()
      return { element, distance: Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom)) }
    }).sort((a, b) => a.distance - b.distance)[0]
    if (nearest) target = nearest.element
    else if (target !== moving.parentElement) return { target, kind: "inside" as const, vertical: false, box: target.getBoundingClientRect() }
    else return null
  }
  if (target.contains(moving)) return null
  const box = target.getBoundingClientRect()
  const dx = (x - box.left) / box.width, dy = (y - box.top) / box.height
  const parentStyle = getComputedStyle(target.parentElement!)
  const wrapsText = floating && target.tagName === "P"
  const movingBox = moving.getBoundingClientRect()
  // Nearby tops alone do not imply a row: short stacked paragraphs can be less
  // than 30px apart. Horizontal drops need actual vertical overlap in a row/grid.
  const sameRow = moving.parentElement === target.parentElement && /flex|grid/.test(parentStyle.display)
    && !(parentStyle.display.includes("flex") && parentStyle.flexDirection.startsWith("column"))
    && Math.min(movingBox.bottom, box.bottom) - Math.max(movingBox.top, box.top) > 1
  let kind: "before" | "after" | "inside" | "left" | "right" | "float-left" | "float-right"
  if (wrapsText && dy >= 0.2 && dy <= 0.8 && (dx < 0.2 || dx > 0.8)) kind = dx < 0.2 ? "float-left" : "float-right"
  else if (sameRow) kind = (dx < 0.5) !== (parentStyle.direction === "rtl") ? "before" : "after"
  else if (dy < 0.2) kind = "before"
  else if (dy > 0.8) kind = "after"
  else if (dx < 0.2) kind = wrapsText ? "float-left" : "left"
  else if (dx > 0.8) kind = wrapsText ? "float-right" : "right"
  else if (flowContainer(target) && !mediaGroup(target)) kind = "inside"
  else kind = dy < 0.5 ? "before" : "after"
  return { target, kind, vertical: sameRow, box }
}
