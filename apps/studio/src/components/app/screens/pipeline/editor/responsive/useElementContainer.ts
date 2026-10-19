import { useState } from "react"
import { inspectImageContainer } from "./flowLayout"
import { elementContainer } from "./elementContainer"
import type { useFlowSelection } from "./useFlowSelection"

export function useElementContainer(selection: ReturnType<typeof useFlowSelection>) {
  const { node, doc, geometry, editor, locked } = selection
  const [requested, setRequested] = useState<typeof node>()
  const open = !!requested && requested === node && !!geometry
  const request = () => { if (node) setRequested(node) }
  const close = () => setRequested(undefined)
  const parent = node?.parentId ? doc.nodes[node.parentId] : undefined
  const canSelectParent = parent?.kind === "element" && parent.id !== doc.rootId
  const hasLock = () => {
    if (!geometry) return true
    for (let current: HTMLElement | null = geometry.element; current; current = current.parentElement) {
      if (locked[current.dataset.adtId ?? ""]) return true
    }
    return [...geometry.element.querySelectorAll<HTMLElement>("[data-adt-id]")].some(child => locked[child.dataset.adtId ?? ""])
  }
  const canWrap = !!geometry?.canWrap && !hasLock()

  function wrap() {
    close()
    // Recheck the live element and model, in case the layout changed while the dialog was open.
    if (!node || requested !== node || !geometry?.element.isConnected || hasLock()
      || !inspectImageContainer(geometry.element).canWrap || parent?.kind !== "element") return
    const plan = elementContainer(geometry.element, geometry.flow)
    if (!plan) return
    const index = parent.children.indexOf(node.id)
    if (index < 0) return
    editor.transaction(() => {
      const container = editor.insertNode({ tag: "div",
        attrs: { "data-responsive-container": "true", style: plan.slot ? `display: flow-root; align-self: ${plan.alignSelf};` : "display: block; width: 100%; min-width: 0;" },
        ...(plan.slot ? { classes: ["w-full", "min-w-0", "max-w-full", ...(plan.row ? ["flex-1"] : [])] } : {}),
      }, { parentId: parent.id, index })
      if (!container) return
      if (!editor.moveNode(node.id, { parentId: container, index: 0 })) {
        editor.removeNode(container)
        return
      }
      if (plan.slot) {
        // Preserve the measured border-box and all decoration/typography. Keep
        // breakpoint widths (e.g. max-sm:w-full); only replace base constraints.
        const classes = node.classes.filter(value => !/^(?:(?:min-|max-)?w-.*|box-(?:border|content)|-?m[xlrse]-.*)$/.test(value))
        const margins = plan.alignment === "right" ? ["ml-auto", "mr-0"] : plan.alignment === "center" ? ["mx-auto"] : ["ml-0", "mr-auto"]
        editor.setClasses(node.id, [...new Set([...classes, `w-[${plan.width}px]`, "min-w-0", "max-w-full", "box-border", ...margins])])
        const style = document.createElement("div").style
        style.cssText = node.attrs.style ?? ""
        for (const property of ["width", "min-width", "max-width", "box-sizing", "margin-left", "margin-right", "margin-inline", "margin-inline-start", "margin-inline-end"]) style.removeProperty(property)
        if (style.cssText !== (node.attrs.style ?? "")) editor.placeNode(node.id, { style: style.cssText || null, coalesce: false })
      }
      editor.select(node.id)
    })
  }

  return { open, request, close, wrap, canWrap, canSelectParent, image: node?.tag === "img", slot: !!geometry && (geometry.flow.row || geometry.flow.grid),
    selectParent: () => { close(); if (canSelectParent) editor.select(parent.id) } }
}
