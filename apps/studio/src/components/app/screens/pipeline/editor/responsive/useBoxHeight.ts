import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { commitHeight, heightFrames, measureHeight } from "./boxHeight"
import type { useFlowSelection } from "./useFlowSelection"
import { useStylePreview } from "./inspection/StyleInspection"
import { previewStyle, snapshotStyles } from "./inspection/styleChanges"

export function useBoxHeight(selection: ReturnType<typeof useFlowSelection>, onInteraction: () => void) {
  const { t } = useLingui()
  const reportPreview = useStylePreview()
  const { geometry, node, doc, editor, locked, refresh } = selection
  const frames = geometry ? heightFrames(geometry.element, locked) : []
  const cancel = useRef<(() => void) | null>(null)
  const [dragging, setDragging] = useState(false)
  const [feedback, setFeedback] = useState("")
  useEffect(() => () => cancel.current?.(), [node?.id, doc, locked])
  useEffect(() => setFeedback(""), [node?.id])
  function apply(value: number) {
    if (!frames.length || !Number.isFinite(value)) return
    onInteraction()
    const measured = measureHeight(frames), result = measured.preview(value)
    measured.restore()
    commitHeight(editor, doc, result.changes)
  }
  function start(event: PointerEvent) {
    if (event.button !== 0 || !frames.length) return
    cancel.current?.(); onInteraction()
    event.preventDefault(); event.stopPropagation()
    const before = new Map(frames.map(element => [element, snapshotStyles(element)]))
    const measured = measureHeight(frames), startY = event.clientY
    let result: ReturnType<typeof measured.preview> | undefined
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      const delta = e.clientY - startY
      if (!result && Math.abs(delta) < 4) return
      e.preventDefault(); e.stopPropagation()
      result = measured.preview(measured.originalHeight + delta)
      reportPreview({ entries: result.changes.map(({ element, height, top, bottom, center }) => previewStyle(doc, element, {
        "min-height": `${height}px`, height: "auto", "padding-top": `${top}px`, "padding-bottom": `${bottom}px`, "max-height": "none", "box-sizing": "border-box",
        ...(center ? { display: "flex", "flex-direction": "column", "justify-content": "center" } : {}),
      }, before.get(element)!, "classes")), point: { x: e.clientX, y: e.clientY }, bounds: selection.host.current?.getBoundingClientRect() })
      setDragging(true); refresh.current()
      const height = result.actual
      setFeedback(height > measured.originalHeight + delta + 2 ? t`Height: ${height}px · content needs this space` : t`Height: ${height}px`)
    }
    function cleanup() {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", abort, true)
      window.removeEventListener("blur", abort)
      window.removeEventListener("keydown", key, true)
      measured.restore(); refresh.current(); setDragging(false); cancel.current = null
      reportPreview(null)
    }
    function abort() { cleanup(); setFeedback(t`Gesture cancelled`) }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); abort() }
      else if ((e.metaKey || e.ctrlKey) && ["z", "y"].includes(e.key.toLowerCase())) abort()
    }
    function finish(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      if (result) move(e)
      cleanup()
      if (!result) return
      e.preventDefault(); e.stopImmediatePropagation()
      const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation() }
      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, true), 0)
      commitHeight(editor, doc, result.changes)
    }
    window.addEventListener("pointermove", move, { capture: true, passive: false })
    window.addEventListener("pointerup", finish, true)
    window.addEventListener("pointercancel", abort, true)
    window.addEventListener("blur", abort)
    window.addEventListener("keydown", key, true)
    cancel.current = abort
  }
  return { canResize: frames.length > 0, start, apply, dragging, feedback, clearFeedback: () => setFeedback("") }
}
