import { useLayoutEffect, useRef, useState } from "react"
import { useEditorStoreApi } from "adt-html-editor"
import type { useFlowSelection } from "../useFlowSelection"
import { useStylePreview } from "../inspection/StyleInspection"
import { previewStyle, snapshotStyles } from "../inspection/styleChanges"
import { usePosition } from "./PositionProvider"
import { addOffset, ancestorScale, readTranslation, translationMatches } from "./translation"

export function useFreeTransform(selection: ReturnType<typeof useFlowSelection>) {
  const position = usePosition(), store = useEditorStoreApi(), reportPreview = useStylePreview()
  const enabled = position?.setEnabled
  const cancel = useRef<(() => void) | null>(null)
  const [origin, setOrigin] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const active = position?.active ?? false
  const element = position?.measured?.element
  useLayoutEffect(() => { enabled?.(true); return () => enabled?.(false) }, [enabled])
  useLayoutEffect(() => () => cancel.current?.(), [active, element, selection.doc, selection.locked])

  function start(event: PointerEvent) {
    if (!active || !position || !element || !selection.node || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return
    if ((event.target as Element).closest('input,textarea,select,button,a,[role="button"],[contenteditable]:not([contenteditable="false"])')) return
    const values = readTranslation(element), scale = ancestorScale(element)
    if (!values || !scale) return
    cancel.current?.()
    event.preventDefault(); event.stopImmediatePropagation()
    const target = element, id = selection.node.id, model = selection.doc
    const startX = event.clientX, startY = event.clientY
    const rect = target.getBoundingClientRect(), bounds = selection.host.current!.getBoundingClientRect()
    const before = snapshotStyles(target)
    const scroll = target.closest(".adt-canvas")?.parentElement
    const scrollX = scroll?.scrollLeft ?? 0, scrollY = scroll?.scrollTop ?? 0
    let changed = false, value = ""
    function move(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      const dx = e.clientX - startX, dy = e.clientY - startY
      if (!changed && Math.hypot(dx, dy) < 3) return
      changed = true
      e.preventDefault(); e.stopImmediatePropagation()
      value = `${addOffset(values!.parts[0], (dx + (scroll?.scrollLeft ?? 0) - scrollX) / scale!.x)} ${addOffset(values!.parts[1], (dy + (scroll?.scrollTop ?? 0) - scrollY) / scale!.y)}`
      target.style.setProperty("translate", value, target.style.getPropertyPriority("translate"))
      if (!translationMatches(target, value)) { cleanup(); position?.blocked(); return }
      // The browser simplifies nested calc expressions, retaining percentage bases.
      value = getComputedStyle(target).translate
      setOrigin({ left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height })
      selection.refresh.current()
      reportPreview({ entries: [previewStyle(model, target, { translate: value }, before)], point: { x: e.clientX, y: e.clientY }, bounds })
    }
    function cleanup() {
      window.removeEventListener("pointermove", move, true)
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", abort, true)
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("blur", blur)
      // Restore from the latest model, so a concurrent Undo/lock/document edit
      // cannot leave an old DOM preview over newer state.
      const current = store.state.doc.nodes[id]
      const style = document.createElement("div").style
      if (current?.kind === "element") style.cssText = current.attrs.style ?? ""
      target.style.setProperty("translate", style.getPropertyValue("translate"), style.getPropertyPriority("translate"))
      cancel.current = null
      if (position) position.cancel.current = null
      setOrigin(null); reportPreview(null); selection.refresh.current()
    }
    function abort(e?: PointerEvent) { if (!e || e.pointerId === event.pointerId) cleanup() }
    function blur() { cleanup(); position?.stop() }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cleanup(); position?.stop() }
      else if ((e.metaKey || e.ctrlKey) && ["z", "y"].includes(e.key.toLowerCase())) cleanup()
    }
    function finish(e: PointerEvent) {
      if (e.pointerId !== event.pointerId) return
      if (changed) move(e)
      cleanup()
      if (!changed) return
      e.preventDefault(); e.stopImmediatePropagation()
      const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation() }
      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, true), 0)
      position?.apply(value)
    }
    window.addEventListener("pointermove", move, { capture: true, passive: false })
    window.addEventListener("pointerup", finish, true)
    window.addEventListener("pointercancel", abort, true)
    window.addEventListener("keydown", key, true)
    window.addEventListener("blur", blur)
    cancel.current = abort; position.cancel.current = abort
  }

  useLayoutEffect(() => {
    if (!active || !element || !position) return
    element.setAttribute("data-responsive-transform", "")
    const native = (event: Event) => { event.preventDefault(); event.stopPropagation() }
    const key = (event: KeyboardEvent) => {
      if ((event.target as Element).closest('input,textarea,select,[role="combobox"],[role="listbox"],[role="menu"],[role="dialog"],[contenteditable]:not([contenteditable="false"])')) return
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); position.stop(); return }
      if (event.metaKey || event.ctrlKey || event.altKey || cancel.current) return
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!direction) return
      const values = readTranslation(element)
      if (!values) return
      event.preventDefault(); event.stopImmediatePropagation()
      const step = event.shiftKey ? 10 : 1
      position.apply(`${addOffset(values.parts[0], direction[0] * step)} ${addOffset(values.parts[1], direction[1] * step)}`)
    }
    element.addEventListener("pointerdown", start, true)
    element.addEventListener("dragstart", native, true)
    window.addEventListener("keydown", key, true)
    return () => {
      element.removeAttribute("data-responsive-transform")
      element.removeEventListener("pointerdown", start, true)
      element.removeEventListener("dragstart", native, true)
      window.removeEventListener("keydown", key, true)
    }
  })
  return { active, origin, stop: position?.stop }
}
