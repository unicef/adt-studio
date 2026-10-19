import { componentOf, flowContainer, layoutChildren, layoutOperations, movableComponent } from "./componentLayout"
import type { useFlowSelection } from "./useFlowSelection"
import type { componentDrop } from "./componentDrop"
import { applyTextFlow, selectedTextFlow, surroundingTextFlow, wrapObject } from "./textFlow"
import { centerContainer, rowContainer, visualOperations } from "./visualLayout"

export function useComponentLayout(selection: ReturnType<typeof useFlowSelection>) {
  const { geometry, doc, editor, locked } = selection
  const component = geometry ? componentOf(geometry.element) : null
  const operations = layoutOperations(editor, doc)
  function unlocked(element: HTMLElement, descendants = true) {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      if (locked[current.dataset.adtId ?? ""]) return false
    }
    return !descendants || !Array.from(element.querySelectorAll<HTMLElement>("[data-adt-id]")).some(child => locked[child.dataset.adtId ?? ""])
  }
  const canArrange = !!component?.isConnected && !!component.parentElement && movableComponent(component) && unlocked(component)
  const children = component && canArrange ? layoutChildren(component) : []
  const canLayout = children.length > 1 && children.every(child => unlocked(child))
  const wrapPlan = canArrange && component ? selectedTextFlow(component) : null
  const allowedPlan = (plan: typeof wrapPlan) => !!plan && unlocked(plan.parent, false)
    && unlocked(plan.object) && plan.members.every(member => unlocked(member))
  const canFloat = allowedPlan(wrapPlan)
  const row = component ? rowContainer(component) : null
  const centered = geometry ? centerContainer(geometry.element) : null
  const canRow = !!row && unlocked(row)
  const canCenter = !!centered && unlocked(centered)
  const visual = visualOperations(editor, doc)

  function canDrop(target: HTMLElement, kind: NonNullable<ReturnType<typeof componentDrop>>["kind"]) {
    if (!canArrange || !component || !target.isConnected || component.contains(target) || (kind !== "inside" && target.contains(component)) || !unlocked(target)) return false
    if (kind.startsWith("float-")) return target.tagName === "P" && allowedPlan(surroundingTextFlow(component, target))
    const parent = kind === "inside" ? target : target.parentElement
    if (!parent || !flowContainer(parent) || !unlocked(parent, false)) return false
    const node = doc.nodes[(kind === "inside" ? target : target.parentElement)?.dataset.adtId ?? doc.rootId]
    return node?.kind === "element" && (kind === "inside" || movableComponent(target))
  }

  function drop(target: HTMLElement, kind: NonNullable<ReturnType<typeof componentDrop>>["kind"]) {
    if (!component || !canDrop(target, kind)) return false
    if (kind === "left" || kind === "right") return operations.beside(component, target, kind === "left")
    if (kind === "float-left" || kind === "float-right") {
      const plan = surroundingTextFlow(component, target)
      return !!plan && applyTextFlow(editor, doc, plan, kind === "float-left" ? "left" : "right")
    }
    const source = doc.nodes[component.dataset.adtId ?? ""]
    const destination = doc.nodes[target.dataset.adtId ?? doc.rootId]
    const parentId = kind === "inside" ? destination?.id : destination?.parentId
    const parent = parentId ? doc.nodes[parentId] : undefined
    if (!source || !destination || parent?.kind !== "element") return false
    const index = kind === "inside" ? parent.children.length : parent.children.indexOf(destination.id) + (kind === "after" ? 1 : 0)
    let moved = false
    editor.transaction(() => {
      moved = editor.moveNode(source.id, { parentId: parent.id, index })
      if (moved && source.parentId !== parent.id) operations.fit(component)
      editor.select(source.id)
    })
    return moved
  }

  const previous = component?.previousElementSibling
  const next = component?.nextElementSibling
  const pairPrevious = previous instanceof HTMLElement && canDrop(previous, "right") ? previous : null
  const pairNext = next instanceof HTMLElement && canDrop(next, "left") ? next : null

  function swap() {
    if (!canLayout || children.length !== 2 || !component) return
    editor.moveNode(children[1].dataset.adtId!, { parentId: component.dataset.adtId!, index: 0 })
  }

  return { component, canArrange, canLayout, canFloat, wrapsText: !!component && wrapObject(component), canSwap: canLayout && children.length === 2,
    pairPrevious, pairNext,
    canRow, canCenter,
    row: (alignment: "start" | "center" | "end") => { if (row && canRow) visual.row(row, alignment) },
    center: () => { if (centered && canCenter) visual.center(centered) },
    canDrop, drop, swap,
    select: () => { if (component) editor.select(component.dataset.adtId!) },
    columns: (stacked: boolean) => { if (component && canLayout) operations.columns(component, stacked) },
    floatSide: (side: "left" | "right") => { if (canFloat && wrapPlan) applyTextFlow(editor, doc, wrapPlan, side) },
  }
}
