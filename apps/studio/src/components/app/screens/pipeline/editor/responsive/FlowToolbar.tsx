import type { ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, CornerLeftUp, Minus, Plus, Type } from "lucide-react"
import { alignmentStyle, widthStyle } from "./flowLayout"
import type { useFlowSelection } from "./useFlowSelection"
import type { useFlowGestures } from "./useFlowGestures"
import type { useComponentLayout } from "./useComponentLayout"
import type { useArrangeGesture } from "./useArrangeGesture"
import { ArrangeControls } from "./ArrangeControls"
import { BoxSizeControls } from "./BoxSizeControls"
import type { useBoxHeight } from "./useBoxHeight"
import type { useElementContainer } from "./useElementContainer"
import { TagPicker } from "./tags/TagPicker"

function Tool({ label, children, ...props }: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" title={label} aria-label={label} {...props} className="flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30">{children}</button>
}

export function FlowToolbar({ selection, gestures, layout, arrange, height, container }: {
  selection: ReturnType<typeof useFlowSelection>; gestures: ReturnType<typeof useFlowGestures>
  layout: ReturnType<typeof useComponentLayout>; arrange: ReturnType<typeof useArrangeGesture>
  height: ReturnType<typeof useBoxHeight>
  container: ReturnType<typeof useElementContainer>
}) {
  const { t } = useLingui()
  const { node, geometry, doc, editor } = selection
  if (!node || !geometry) return null
  const { flow, orderFlow, orderTargets, box, hostWidth } = geometry
  const parent = node.parentId ? doc.nodes[node.parentId] : undefined
  const parentTag = parent?.kind === "element" && parent.id !== doc.rootId ? parent.tag : null
  const siblingIndex = orderTargets.findIndex(target => target.element === geometry.orderElement)
  const textSize = (delta: number) => {
    const size = Math.max(10, Math.min(96, parseFloat(getComputedStyle(geometry.element).fontSize) + delta))
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    gestures.apply({ "font-size": `${size / rootSize}rem` })
  }
  const percent = Math.round(box.width / flow.parentWidth * 100)
  return (
    <div
      role="toolbar"
      data-responsive-toolbar
      aria-label={t`Quick layout controls`}
      className="pointer-events-auto absolute z-30 flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border bg-background p-1 shadow-lg"
      style={{ top: Math.max(8, box.top - (hostWidth < 700 ? 100 : 64)), left: Math.max(8, Math.min(box.left, hostWidth - 680)), width: "max-content", maxWidth: hostWidth - 16 }}
      onPointerDown={event => event.stopPropagation()}
    >
      <TagPicker id={node.id} />
      <Tool label={t`Select parent`} disabled={!parentTag} onClick={() => editor.select(node.parentId)}><CornerLeftUp className="size-4" /></Tool>
      <ArrangeControls selection={selection} layout={layout} arrange={arrange} container={container} />
      <BoxSizeControls selection={selection} height={height} />
      <div className="mx-0.5 h-5 w-px bg-border" />
      <Tool label={t`Align left`} disabled={!flow.canAlign} onClick={() => gestures.apply(alignmentStyle(flow, "left"))}><AlignLeft className="size-4" /></Tool>
      <Tool label={t`Align center`} disabled={!flow.canAlign} onClick={() => gestures.apply(alignmentStyle(flow, "center"))}><AlignCenter className="size-4" /></Tool>
      <Tool label={t`Align right`} disabled={!flow.canAlign} onClick={() => gestures.apply(alignmentStyle(flow, "right"))}><AlignRight className="size-4" /></Tool>
      <div className="mx-0.5 h-5 w-px bg-border" />
      {flow.text ? <>
        <Tool label={t`Decrease text size`} disabled={flow.constrained} onClick={() => textSize(-2)}><Type className="size-3" /><Minus className="size-2" /></Tool>
        <Tool label={t`Increase text size`} disabled={flow.constrained} onClick={() => textSize(2)}><Type className="size-4" /><Plus className="size-2" /></Tool>
      </> : <>
        <Tool label={t`Decrease width`} disabled={!flow.canResize} onClick={() => gestures.apply(widthStyle(flow, percent - 10))}><Minus className="size-4" /></Tool>
        <Tool label={t`Increase width`} disabled={!flow.canResize} onClick={() => gestures.apply(widthStyle(flow, percent + 10))}><Plus className="size-4" /></Tool>
      </>}
      <Tool label={t`Move earlier`} disabled={!orderFlow.canReorder || siblingIndex <= 0} onClick={() => gestures.reorder(-1)}><ArrowUp className="size-4" /></Tool>
      <Tool label={t`Move later`} disabled={!orderFlow.canReorder || siblingIndex >= orderTargets.length - 1} onClick={() => gestures.reorder(1)}><ArrowDown className="size-4" /></Tool>
      <Tool label={t`Decrease space below`} disabled={!flow.canSpace} onClick={() => gestures.apply({ "margin-bottom": `${Math.max(0, (parseFloat(getComputedStyle(geometry.element).marginBottom) || 0) - 4)}px` })}><Minus className="size-3 text-amber-600" /></Tool>
      <Tool label={t`Increase space below`} disabled={!flow.canSpace} onClick={() => gestures.apply({ "margin-bottom": `${Math.min(96, (parseFloat(getComputedStyle(geometry.element).marginBottom) || 0) + 4)}px` })}><Plus className="size-3 text-amber-600" /></Tool>
    </div>
  )
}
