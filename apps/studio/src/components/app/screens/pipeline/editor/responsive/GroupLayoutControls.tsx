import { useLayoutEffect, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { flowContainer, layoutOperations, movableComponent } from "./componentLayout"
import { groupMembers, visualOperations } from "./visualLayout"
import { applyTextFlow, groupTextFlow } from "./textFlow"
import { LayoutMenu } from "./LayoutMenu"
import type { useFlowSelection } from "./useFlowSelection"

export function GroupLayoutControls({ selection }: { selection: ReturnType<typeof useFlowSelection> }) {
  const { t } = useLingui()
  const { host, selected, editing, doc, editor, locked } = selection
  const [geometry, setGeometry] = useState<{ members: HTMLElement[]; left: number; top: number; width: number; height: number; hostWidth: number } | null>(null)
  useLayoutEffect(() => {
    const root = host.current
    if (!root || selected.length < 2 || editing) { setGeometry(null); return }
    const members = groupMembers(selected.map(id => root.querySelector<HTMLElement>(`[data-adt-id="${CSS.escape(id)}"]`))
      .filter((element): element is HTMLElement => !!element))
    if (members.length < 2) { setGeometry(null); return }
    const measure = () => {
      const bounds = root.getBoundingClientRect(), boxes = members.map(element => element.getBoundingClientRect())
      const left = Math.min(...boxes.map(box => box.left)), top = Math.min(...boxes.map(box => box.top))
      setGeometry({ members, left: left - bounds.left, top: top - bounds.top,
        width: Math.max(...boxes.map(box => box.right)) - left, height: Math.max(...boxes.map(box => box.bottom)) - top, hostWidth: bounds.width })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root); members.forEach(member => observer.observe(member))
    root.addEventListener("scroll", measure, true)
    return () => { observer.disconnect(); root.removeEventListener("scroll", measure, true) }
  }, [host, selected, editing, doc])
  if (!geometry) return null
  const { members } = geometry
  const parent = members[0].parentElement!
  const unlocked = (element: HTMLElement) => {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      if (locked[current.dataset.adtId ?? ""]) return false
    }
    return !Array.from(element.querySelectorAll<HTMLElement>("[data-adt-id]")).some(child => locked[child.dataset.adtId ?? ""])
  }
  const siblings = Array.from(parent.childNodes).filter(node => node.nodeType === Node.ELEMENT_NODE || node.textContent?.trim())
  const start = siblings.indexOf(members[0])
  const valid = flowContainer(parent) && members.every((member, index) => member.parentElement === parent
    && siblings[start + index] === member && movableComponent(member, true) && unlocked(member))
  const wrapPlan = valid ? groupTextFlow(members) : null
  function group(stacked: boolean) {
    if (!valid) return
    const parentId = parent.dataset.adtId ?? doc.rootId, node = doc.nodes[parentId]
    if (node?.kind !== "element") return
    editor.transaction(() => {
      const wrapper = editor.insertNode({ tag: "div", classes: ["grid", stacked ? "grid-cols-1" : "grid-cols-2", "max-sm:grid-cols-1", "gap-6", "items-start", "w-full", "clear-both"] },
        { parentId, index: node.children.indexOf(members[0].dataset.adtId!) })
      if (!wrapper) return
      const operations = layoutOperations(editor, doc)
      members.forEach((member, index) => {
        editor.moveNode(member.dataset.adtId!, { parentId: wrapper, index })
        operations.fit(member)
      })
      editor.select(wrapper)
    })
  }
  const actions = [
    { label: t`Row · align centres`, disabled: !valid, run: () => { if (valid) visualOperations(editor, doc).groupRow(members, "center") } },
    { label: t`Row · align tops`, disabled: !valid, run: () => { if (valid) visualOperations(editor, doc).groupRow(members, "start") } },
    { label: t`Row · align bottoms`, disabled: !valid, run: () => { if (valid) visualOperations(editor, doc).groupRow(members, "end") } },
    { label: t`Wrap text · object on left`, disabled: !wrapPlan, run: () => { if (wrapPlan) applyTextFlow(editor, doc, wrapPlan, "left") } },
    { label: t`Wrap text · object on right`, disabled: !wrapPlan, run: () => { if (wrapPlan) applyTextFlow(editor, doc, wrapPlan, "right") } },
    { label: t`Side by side · equal columns`, disabled: !valid, run: () => group(false) },
    { label: t`One below another`, disabled: !valid, run: () => group(true) },
  ]
  return <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
    <div className="absolute border-2 border-primary" style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }} />
    <div role="toolbar" aria-label={t`Group layout controls`}
      className="pointer-events-auto absolute flex max-w-full flex-wrap items-center gap-2 rounded-xl border bg-background p-1 shadow-lg"
      style={{ top: Math.max(8, geometry.top - 48), left: Math.max(8, Math.min(geometry.left, geometry.hostWidth - 340)), maxWidth: geometry.hostWidth - 16 }}
      onPointerDown={event => event.stopPropagation()}>
      <span className="px-2 text-xs">{t`Selected items`}</span>
      <LayoutMenu actions={actions} canFloat={!!wrapPlan} />
      {!valid && <span className="max-w-72 px-2 text-xs text-muted-foreground">{t`Select neighbouring items in the same container to arrange them together.`}</span>}
    </div>
  </div>
}
