import { useLayoutEffect, useState, type RefObject } from "react"
import type { StyledNode } from "adt-html-editor"
import { elementStyles } from "./elementStyles"
import { declarations } from "./styleChanges"

export function useElementStyles(node: StyledNode, host: RefObject<HTMLElement | null>, expanded: boolean) {
  const [styles, setStyles] = useState<ReturnType<typeof elementStyles>>(() => ({ inline: declarations(node.attrs.style), computed: {} }))
  useLayoutEffect(() => {
    // Node ids can repeat across editors. Always look inside this panel's editor.
    const root = host.current?.closest(".adt-editor")?.querySelector<HTMLElement>(".adt-canvas")
    if (!root) return
    let frame = 0
    const read = () => {
      frame = 0
      const element = root.querySelector<HTMLElement>(`[data-adt-id="${CSS.escape(node.id)}"]`)
      const next = element ? elementStyles(element, expanded) : { inline: declarations(node.attrs.style), computed: {} }
      setStyles(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read) }
    const mutations = new MutationObserver(schedule)
    mutations.observe(root, { attributes: true, childList: true, subtree: true, characterData: true })
    // Tailwind compilation can finish after the selection or classes change.
    mutations.observe(root.ownerDocument.head, { attributes: true, childList: true, subtree: true, characterData: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(root)
    const element = root.querySelector<HTMLElement>(`[data-adt-id="${CSS.escape(node.id)}"]`)
    if (element) resize.observe(element)
    window.addEventListener("resize", schedule)
    root.addEventListener("pointerover", schedule)
    root.addEventListener("pointerout", schedule)
    read()
    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect(); resize.disconnect()
      window.removeEventListener("resize", schedule)
      root.removeEventListener("pointerover", schedule)
      root.removeEventListener("pointerout", schedule)
    }
  }, [node, host, expanded])
  return styles
}
