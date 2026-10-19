import { useLayoutEffect, useState, type RefObject } from "react"
import { useLingui } from "@lingui/react/macro"
import { useDocument, useEditorSelector, useLayoutMode, useSelectedIds } from "adt-html-editor"
import { ancestorScale, readTranslation } from "./translation"

export function usePositionTarget(root: RefObject<HTMLDivElement | null>) {
  const { t } = useLingui()
  const doc = useDocument(), selected = useSelectedIds(), layout = useLayoutMode()
  const editing = useEditorSelector(state => state.editingTextId)
  const locked = useEditorSelector(state => state.locked)
  const node = selected.length === 1 ? doc.nodes[selected[0]] : undefined
  const styled = layout === "flow" && node?.kind === "element" && node.id !== doc.rootId ? node : undefined
  const [measured, setMeasured] = useState<{ id: string; element: HTMLElement; x: number; y: number; reason: string } | null>(null)
  useLayoutEffect(() => {
    const canvas = root.current?.querySelector<HTMLElement>(".adt-canvas")
    if (!canvas || !styled || editing) { setMeasured(null); return }
    let frame = 0
    function measure() {
      const element = canvas!.querySelector<HTMLElement>(`[data-adt-id="${CSS.escape(styled!.id)}"]`)
      if (!(element instanceof HTMLElement)) { setMeasured(null); return }
      const css = getComputedStyle(element), values = readTranslation(element)
      const lockedWithin = [element, ...element.querySelectorAll<HTMLElement>("[data-adt-id]")].some(item => locked[item.dataset.adtId ?? ""])
      let lockedAbove = false
      for (let item = styled; item; item = item.parentId ? doc.nodes[item.parentId] as typeof styled : undefined) {
        if (locked[item.id]) lockedAbove = true
      }
      const reason = lockedWithin || lockedAbove ? t`Unlock this element and its contents first.`
        : (css.display === "inline" && !/^(IMG|VIDEO|CANVAS|IFRAME)$/.test(element.tagName)) || /^(TR|TD|TH|TBODY|THEAD|TFOOT|COL|COLGROUP)$/.test(element.tagName)
          ? t`Select or wrap a container to offset this element.`
        : ["none", "contents"].includes(css.display) || !element.offsetWidth || !element.offsetHeight ? t`This element has no visible box.`
        : ["absolute", "fixed", "sticky"].includes(css.position) ? t`Select a normal-flow container for this positioned element.`
        : !values || !ancestorScale(element) ? t`Select the outer container to offset this transformed group.` : ""
      const next = { id: styled!.id, element, x: values?.x ?? 0, y: values?.y ?? 0, reason }
      setMeasured(previous => previous?.id === next.id && previous.element === element && previous.x === next.x && previous.y === next.y && previous.reason === reason ? previous : next)
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new MutationObserver(schedule)
    observer.observe(canvas, { attributes: true, childList: true, subtree: true })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(canvas)
    const element = canvas.querySelector<HTMLElement>(`[data-adt-id="${CSS.escape(styled.id)}"]`)
    if (element) resize.observe(element)
    window.addEventListener("resize", schedule)
    measure()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener("resize", schedule) }
  }, [doc, styled, locked, editing, root, t])
  return { node: styled, measured: measured?.id === styled?.id ? measured : null, doc, locked, editing }
}
