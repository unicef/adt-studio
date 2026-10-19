import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { componentDrop } from "./componentDrop"
import type { useFlowSelection } from "./useFlowSelection"
import type { useComponentLayout } from "./useComponentLayout"
import { useStylePreview } from "./inspection/StyleInspection"
import { elementLabel, styleEntry } from "./inspection/styleChanges"

export function useArrangeGesture(selection: ReturnType<typeof useFlowSelection>, layout: ReturnType<typeof useComponentLayout>) {
  const { t } = useLingui()
  const reportPreview = useStylePreview()
  const [active, setActive] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [ghost, setGhost] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [indicator, setIndicator] = useState<typeof ghost>(null)
  const cancel = useRef<(() => void) | null>(null)
  const { host, node, doc, locked } = selection
  useEffect(() => () => { cancel.current?.(); setActive(false) }, [node?.id, doc, locked])
  useEffect(() => { setFeedback("") }, [node?.id])
  useEffect(() => {
    if (!active) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      cancel.current?.()
      setActive(false)
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    window.addEventListener("keydown", escape, true)
    return () => window.removeEventListener("keydown", escape, true)
  }, [active])

  function start(event: PointerEvent, preserveClick = false) {
    const component = layout.component, root = host.current
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || !layout.canArrange || !component || !root) return
    cancel.current?.()
    if (!preserveClick) { event.preventDefault(); event.stopPropagation() }
    setFeedback("")
    const original = component.getBoundingClientRect()
    let moved = false
    let destination: ReturnType<typeof componentDrop> = null
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      const dx = e.clientX - event.clientX, dy = e.clientY - event.clientY
      if (!moved && Math.hypot(dx, dy) < 5) return
      moved = true
      e.preventDefault()
      e.stopPropagation()
      const bounds = root!.getBoundingClientRect()
      setGhost({ left: original.left + dx - bounds.left, top: original.top + dy - bounds.top, width: original.width, height: original.height })
      destination = componentDrop(root!, component!, e.clientX, e.clientY, layout.wrapsText)
      if (!destination || !layout.canDrop(destination.target, destination.kind)) {
        destination = null; setIndicator(null); reportPreview(null); setFeedback(t`No drop here. Move over another block or a gap between blocks.`); return
      }
      const { box, kind, vertical } = destination
      let { left, top, width, height } = box
      if (kind === "before" || kind === "after") {
        if (vertical) {
          const rightToLeft = getComputedStyle(destination.target.parentElement!).direction === "rtl"
          left = (kind === "before") !== rightToLeft ? box.left : box.right; width = 4
        }
        else { top = kind === "before" ? box.top : box.bottom; height = 4 }
      } else if (kind === "left" || kind === "right" || kind === "float-left" || kind === "float-right") {
        width = box.width / (kind.startsWith("float-") ? 3 : 2)
        if (kind.endsWith("right")) left = box.right - width
      }
      setIndicator({ left: left - bounds.left, top: top - bounds.top, width, height })
      setFeedback(kind === "before" ? t`Place before` : kind === "after" ? t`Place after` : kind === "inside" ? t`Move inside`
        : kind === "float-left" ? t`Wrap text around the component on the left` : kind === "float-right" ? t`Wrap text around the component on the right`
        : kind === "left" ? t`Create columns: place on the left` : t`Create columns: place on the right`)
      const id = component!.dataset.adtId!, targetId = destination.target.dataset.adtId!
      reportPreview({ entries: [styleEntry(id, elementLabel(doc, id), "structure", {}, { [kind]: elementLabel(doc, targetId) })],
        point: { x: e.clientX, y: e.clientY }, bounds })
    }
    const nativeDrag = (e: Event) => { e.preventDefault(); e.stopPropagation() }
    function cleanup() {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", abort, true)
      window.removeEventListener("blur", abort)
      window.removeEventListener("keydown", key, true)
      component!.removeEventListener("dragstart", nativeDrag, true)
      cancel.current = null
      setGhost(null); setIndicator(null)
      reportPreview(null)
    }
    function abort() { cleanup(); setFeedback(t`Gesture cancelled`) }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && ["z", "y"].includes(e.key.toLowerCase()))) {
        abort(); setActive(false)
        if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation() }
      }
    }
    function finish(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      if (moved) move(e)
      cleanup()
      if (!moved) return
      e.preventDefault(); e.stopImmediatePropagation()
      const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation() }
      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, true), 0)
      if (destination) setFeedback(layout.drop(destination.target, destination.kind) ? t`Component moved. Undo restores its previous position.` : t`Already in this position. Choose a different block or gap.`)
      else setFeedback(t`Nothing moved. Drop on a highlighted target inside the page.`)
      setActive(false)
    }
    window.addEventListener("pointermove", move, { capture: true, passive: false })
    window.addEventListener("pointerup", finish, true)
    window.addEventListener("pointercancel", abort, true)
    window.addEventListener("blur", abort)
    window.addEventListener("keydown", key, true)
    component.addEventListener("dragstart", nativeDrag, true)
    cancel.current = abort
  }

  return { active, ghost, indicator, feedback, start,
    clearFeedback: () => setFeedback(""),
    toggle: () => { cancel.current?.(); setActive(!active); setFeedback("") },
  }
}
