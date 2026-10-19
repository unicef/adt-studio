import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { alignmentStyle, mergedStyle, widthStyle } from "./flowLayout"
import type { useFlowSelection } from "./useFlowSelection"
import { useStylePreview } from "./inspection/StyleInspection"
import { elementLabel, previewStyle, snapshotStyles, styleEntry } from "./inspection/styleChanges"

export function useFlowGestures(selection: ReturnType<typeof useFlowSelection>, onBlockedMove: () => void, onInteraction: () => void = () => {}) {
  const { t } = useLingui()
  const reportPreview = useStylePreview()
  const { node, doc, editor, geometry, refresh, host, locked } = selection
  const cancel = useRef<(() => void) | null>(null)
  const [feedback, setFeedback] = useState("")
  const [guide, setGuide] = useState<{ top: number; left: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => () => { cancel.current?.() }, [node?.id, doc, locked])
  useEffect(() => { setFeedback("") }, [node?.id])

  function apply(patch: Record<string, string | undefined>) {
    if (!node) return
    onInteraction()
    editor.placeNode(node.id, { style: mergedStyle(node.attrs.style ?? null, patch), coalesce: false })
  }

  function reorder(direction: -1 | 1) {
    if (!node || !geometry?.orderFlow.canReorder) return
    onInteraction()
    const movingId = geometry.orderElement.dataset.adtId ?? node.id
    const moving = doc.nodes[movingId]
    if (!moving?.parentId) return
    const targets = geometry.orderTargets
    const index = targets.findIndex(target => target.element === geometry.orderElement)
    const target = targets[index + direction]
    if (!target || index < 0) return
    editor.moveNode(movingId, { parentId: moving.parentId, index: direction > 0 ? target.after : target.before })
  }

  function start(event: PointerEvent, mode: "move" | "resize-left" | "resize-right" | "space") {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || !node || !geometry) return
    const { element, flow, orderElement, orderFlow, orderTargets } = geometry
    if ((mode.startsWith("resize") && !flow.canResize) || (mode === "space" && !flow.canSpace)
      || (mode === "move" && !flow.canAlign && !orderFlow.canReorder && !flow.image)) return
    cancel.current?.()
    onInteraction()
    const initial = element.getAttribute("style")
    const modelStyle = node.attrs.style ?? null
    const beforeStyles = snapshotStyles(element)
    const originX = event.clientX
    const originY = event.clientY
    const originalWidth = element.getBoundingClientRect().width
    const originalMargin = parseFloat(getComputedStyle(element).marginBottom) || 0
    const parentBounds = flow.parent.getBoundingClientRect()
    let axis: "x" | "y" | null = null
    let moved = false
    let patch: Record<string, string | undefined> = {}
    let destination: number | null = null
    let blockedMove = false
    const movingId = orderElement.dataset.adtId ?? node.id
    const moving = doc.nodes[movingId]
    const parent = moving?.parentId ? doc.nodes[moving.parentId] : undefined

    function restore() {
      if (initial === null) element.removeAttribute("style")
      else element.setAttribute("style", initial)
    }
    function preview(next: Record<string, string | undefined>, event: PointerEvent) {
      patch = next
      element.setAttribute("style", mergedStyle(initial, patch))
      refresh.current()
      reportPreview({ entries: [previewStyle(doc, element, next, beforeStyles)], point: { x: event.clientX, y: event.clientY }, bounds: host.current?.getBoundingClientRect() })
    }
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      const dx = e.clientX - originX
      const dy = e.clientY - originY
      if (!moved && Math.hypot(dx, dy) < 5) return
      moved = true
      e.preventDefault()
      setDragging(true)
      if (mode.startsWith("resize")) {
        const delta = dx * (mode === "resize-left" ? -1 : 1)
        const percentage = Math.round(Math.max(10, Math.min(100, (originalWidth + delta) / flow.parentWidth * 100)))
        preview(widthStyle(flow, percentage), e)
        setFeedback(t`Width: ${percentage}% of parent`)
      } else if (mode === "space") {
        const spacing = Math.max(0, Math.min(96, Math.round((originalMargin + dy) / 4) * 4))
        preview({ "margin-bottom": `${spacing}px` }, e)
        setFeedback(t`Space below: ${spacing}px`)
      } else {
        axis ??= Math.abs(dy) > Math.abs(dx) ? "y" : "x"
        if (axis === "x" && flow.canAlign) {
          const fraction = (e.clientX - parentBounds.left) / parentBounds.width
          const alignment = fraction < 0.33 ? "left" : fraction > 0.67 ? "right" : "center"
          preview(alignmentStyle(flow, alignment), e)
          setFeedback(alignment === "left" ? t`Align left` : alignment === "right" ? t`Align right` : t`Align center`)
        } else if (axis === "y" && orderFlow.canReorder && parent?.kind === "element") {
          const targets = orderTargets.filter(target => target.element !== orderElement)
          const before = targets.find(target => e.clientY < target.bounds().top + target.bounds().height / 2)
          const target = before ?? targets.at(-1)
          if (!target || !host.current) return
          destination = before ? target.before : target.after
          const targetBox = target.bounds()
          const bounds = host.current.getBoundingClientRect()
          setGuide({ top: (before ? targetBox.top : targetBox.bottom) - bounds.top, left: targetBox.left - bounds.left, width: targetBox.width })
          setFeedback(t`Reorder within this parent`)
          const oldIndex = parent.children.indexOf(movingId)
          reportPreview({ entries: [styleEntry(movingId, elementLabel(doc, movingId), "structure", { index: String(oldIndex) }, { index: String(destination > oldIndex ? destination - 1 : destination) })],
            point: { x: e.clientX, y: e.clientY }, bounds: host.current?.getBoundingClientRect() })
        } else {
          blockedMove = flow.image
          reportPreview(null)
          setFeedback(t`This layout cannot move in that direction`)
        }
      }
    }
    const blockNativeDrag = (e: Event) => { e.preventDefault(); e.stopPropagation() }
    function cleanup() {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", abort, true)
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("blur", abort)
      element.removeEventListener("dragstart", blockNativeDrag, true)
      cancel.current = null
      restore()
      setDragging(false)
      setGuide(null)
      reportPreview(null)
      refresh.current()
    }
    function abort() { cleanup(); setFeedback(t`Gesture cancelled`) }
    function key(e: KeyboardEvent) {
      // Let history shortcuts run only after removing the live DOM preview.
      if ((e.metaKey || e.ctrlKey) && ["z", "y"].includes(e.key.toLowerCase())) { abort(); return }
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopImmediatePropagation()
      abort()
    }
    function finish(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      cleanup()
      if (!moved) return
      // Keep the synthetic click following a drag from selecting a different node.
      const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation() }
      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, true), 0)
      if (blockedMove) {
        onBlockedMove()
      } else if (destination !== null && moving?.parentId) {
        editor.moveNode(movingId, { parentId: moving.parentId, index: destination })
      } else if (Object.keys(patch).length) {
        editor.placeNode(node!.id, { style: mergedStyle(modelStyle, patch), coalesce: false })
      }
    }
    window.addEventListener("pointermove", move, { capture: true, passive: false })
    window.addEventListener("pointerup", finish, true)
    window.addEventListener("pointercancel", abort, true)
    window.addEventListener("keydown", key, true)
    window.addEventListener("blur", abort)
    element.addEventListener("dragstart", blockNativeDrag, true)
    cancel.current = abort
  }

  return { apply, start, reorder, feedback, guide, dragging }
}
