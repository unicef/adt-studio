import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useEditor, useEditorStoreApi } from "adt-html-editor"
import { useLingui } from "@lingui/react/macro"
import { usePositionTarget } from "./usePositionTarget"
import { offsetStyle, readTranslation, translationMatches } from "./translation"

function usePositionController() {
  const { t } = useLingui()
  const root = useRef<HTMLDivElement>(null)
  const target = usePositionTarget(root)
  const editor = useEditor(), store = useEditorStoreApi()
  const [enabled, setEnabled] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const cancel = useRef<(() => void) | null>(null)
  const active = enabled && !!target.node && activeId === target.node.id && !!target.measured && !target.measured.reason
  useLayoutEffect(() => { if (!active) setActiveId(null) }, [active])
  useLayoutEffect(() => setError(""), [target.doc, target.node?.id])
  function blocked() { setError(t`An existing style is preventing this offset.`) }
  function apply(value: string | null) {
    if (!target.node || !target.measured || target.measured.reason) return
    cancel.current?.()
    const current = store.state.doc.nodes[target.node.id]
    if (current?.kind !== "element") return
    const { element } = target.measured
    const previous = element.style.getPropertyValue("translate"), priority = element.style.getPropertyPriority("translate")
    element.style.setProperty("translate", value ?? "", priority)
    const applied = value === null || translationMatches(element, value)
    element.style.setProperty("translate", previous, priority)
    if (!applied) { blocked(); return }
    setError("")
    editor.placeNode(current.id, { style: offsetStyle(current.attrs.style, value), coalesce: false })
  }
  function setAxis(axis: "x" | "y", value: number) {
    if (!Number.isFinite(value) || Math.abs(value) > 10000 || !target.measured) return
    const values = readTranslation(target.measured.element)
    if (!values) return
    values.parts[axis === "x" ? 0 : 1] = `${value}px`
    apply(values.parts.join(" "))
  }
  function stop() { cancel.current?.(); setActiveId(null) }
  function toggle() {
    setError("")
    if (active) stop()
    else if (enabled && target.node && target.measured && !target.measured.reason) setActiveId(target.node.id)
  }
  return { ...target, root, enabled, setEnabled, active, apply, setAxis, stop, toggle, cancel, error, blocked }
}

const PositionContext = createContext<ReturnType<typeof usePositionController> | null>(null)
export function PositionProvider({ children }: { children: ReactNode }) {
  const position = usePositionController()
  return <PositionContext.Provider value={position}><div ref={position.root} className="contents [&_[data-responsive-transform]]:touch-none [&_[data-responsive-transform]]:cursor-move">{children}</div></PositionContext.Provider>
}
export const usePosition = () => useContext(PositionContext)
