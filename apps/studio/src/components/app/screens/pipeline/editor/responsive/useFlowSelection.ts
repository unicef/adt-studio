import { useLayoutEffect, useRef, useState } from "react"
import { useDocument, useEditor, useEditorSelector, useSelectedIds } from "adt-html-editor"
import { inspectImageContainer } from "./flowLayout"
import { flowOrder } from "./flowOrder"

export function useFlowSelection() {
  const host = useRef<HTMLDivElement>(null)
  const editor = useEditor()
  const doc = useDocument()
  const selected = useSelectedIds()
  const editing = useEditorSelector(state => state.editingTextId)
  const locked = useEditorSelector(state => state.locked)
  const id = selected.length === 1 && !editing ? selected[0] : undefined
  const node = id ? doc.nodes[id] : undefined
  const styled = node?.kind === "element" && node.id !== doc.rootId ? node : undefined
  let isLocked = false
  for (let current = node; current; current = current.parentId ? doc.nodes[current.parentId] : undefined) {
    if (locked[current.id]) isLocked = true
  }
  const [geometry, setGeometry] = useState<{
    element: HTMLElement
    flow: ReturnType<typeof inspectImageContainer>["flow"]
    orderElement: HTMLElement
    orderFlow: ReturnType<typeof inspectImageContainer>["orderFlow"]
    orderTargets: ReturnType<typeof flowOrder>
    canWrap: boolean
    box: { left: number; top: number; width: number; height: number }
    parentBox: { left: number; top: number; width: number; height: number }
    hostWidth: number
    hostHeight: number
  } | null>(null)
  const refresh = useRef(() => {})

  useLayoutEffect(() => {
    const root = host.current
    if (!root || !id || !styled || isLocked) { setGeometry(null); return }
    const element = root.querySelector<HTMLElement>(`[data-adt-id="${CSS.escape(id)}"]`)
    if (!element?.parentElement) { setGeometry(null); return }
    let frame = 0
    function measure() {
      if (!root || !element) return
      const bounds = root.getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      const parent = element.parentElement!.getBoundingClientRect()
      const relative = (r: DOMRect) => ({ left: r.left - bounds.left, top: r.top - bounds.top, width: r.width, height: r.height })
      const inspected = inspectImageContainer(element)
      const moving = doc.nodes[inspected.orderElement.dataset.adtId ?? ""]
      const orderParent = moving?.parentId ? doc.nodes[moving.parentId] : undefined
      const orderTargets = inspected.orderFlow.canReorder && orderParent?.kind === "element"
        ? flowOrder(inspected.orderFlow.parent, orderParent.children) : []
      inspected.orderFlow.canReorder = orderTargets.length > 1 && orderTargets.some(target => target.element === inspected.orderElement)
      setGeometry({ element, ...inspected, orderTargets, box: relative(rect), parentBox: relative(parent), hostWidth: bounds.width, hostHeight: bounds.height })
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    refresh.current = schedule
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    observer.observe(element)
    observer.observe(element.parentElement)
    root.addEventListener("scroll", schedule, true)
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      root.removeEventListener("scroll", schedule, true)
      window.removeEventListener("resize", schedule)
      refresh.current = () => {}
    }
  }, [id, styled, isLocked, doc])

  return { host, editor, doc, node: styled, geometry, refresh, locked, selected, editing }
}
