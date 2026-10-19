import { useLingui } from "@lingui/react/macro"
import { useEffect } from "react"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { FlowToolbar } from "./FlowToolbar"
import { useFlowSelection } from "./useFlowSelection"
import { useFlowGestures } from "./useFlowGestures"
import { useElementContainer } from "./useElementContainer"
import { ElementContainerDialog } from "./ElementContainerDialog"
import { useComponentLayout } from "./useComponentLayout"
import { useArrangeGesture } from "./useArrangeGesture"
import { GroupLayoutControls } from "./GroupLayoutControls"
import { useBoxHeight } from "./useBoxHeight"
import { StyleGestureTooltip } from "./inspection/StyleGestureTooltip"
import { useDragRouting } from "./useDragRouting"
import { useFreeTransform } from "./position/useFreeTransform"

export function ResponsiveCanvas() {
  const { t } = useLingui()
  const selection = useFlowSelection()
  const container = useElementContainer(selection)
  const layout = useComponentLayout(selection)
  const arrange = useArrangeGesture(selection, layout)
  const height = useBoxHeight(selection, arrange.clearFeedback)
  const gestures = useFlowGestures(selection, container.request, () => { arrange.clearFeedback(); height.clearFeedback() })
  const transform = useFreeTransform(selection)
  const automaticMove = useDragRouting(selection, layout, arrange, gestures, transform.active)
  useEffect(() => { if (transform.active && arrange.active) arrange.toggle() }, [transform.active, arrange])
  const { geometry, node, doc } = selection
  const parent = node?.parentId ? doc.nodes[node.parentId] : undefined
  const parentTag = parent?.kind === "element" && parent.id !== doc.rootId ? parent.tag : t`section`
  const visible = geometry && geometry.box.top + geometry.box.height > 0 && geometry.box.top < geometry.hostHeight
  const hint = transform.active ? t`Free transform: drag the selected element · arrows nudge · Shift 10px · Esc to finish`
    : arrange.active ? t`Reposition: drag the whole component above, below, beside, or inside another container. Esc cancels.`
    : automaticMove ? t`Drag this component to move it · corners resize · Esc cancels`
    : container.canWrap && (geometry?.flow.row || geometry?.flow.grid) ? t`Wrap in container to resize this component within its row or column.`
    : (geometry?.flow.constrained || geometry?.flow.row || geometry?.flow.grid) && layout.canArrange
      ? t`Drag Reposition to place the whole component.`
    : geometry?.flow.constrained ? t`This layout needs the Styles panel. Select a parent to edit its layout.`
    : geometry?.flow.row || geometry?.flow.grid ? t`This parent controls the layout. Resize its children in Styles or select the parent.`
    : geometry?.flow.inline ? t`Inline text stays in its sentence. Use text controls or select its parent.`
    : t`Drag to align or reorder · corners resize width · blue bottom handle changes height · amber handle adds space · Esc cancels`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={selection.host} className="relative flex min-h-0 flex-1 overflow-hidden">
        <HtmlEditor.Canvas.Viewport />
        <GroupLayoutControls selection={selection} />
        {visible && node && <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <div className="absolute rounded-sm border border-dashed border-teal-500/60" style={geometry.parentBox} />
          <div data-responsive-selection className="absolute border-2 border-primary" style={geometry.box}>
            {!transform.active && !arrange.active && !arrange.ghost && geometry.flow.canResize && (["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(corner => (
              <button
                key={corner}
                type="button"
                tabIndex={-1}
                title={t`Drag to resize width`}
                aria-label={t`Drag to resize width`}
                className="pointer-events-auto absolute size-3 rounded-sm border-2 border-primary bg-background shadow-sm"
                style={{ left: corner.endsWith("left") ? -7 : undefined, right: corner.endsWith("right") ? -7 : undefined, top: corner.startsWith("top") ? -7 : undefined, bottom: corner.startsWith("bottom") ? -7 : undefined, cursor: "ew-resize", touchAction: "none" }}
                onPointerDown={event => { event.preventDefault(); event.stopPropagation(); gestures.start(event.nativeEvent, corner.endsWith("left") ? "resize-left" : "resize-right") }}
              />
            ))}
            {!transform.active && !arrange.active && !arrange.ghost && height.canResize && <button type="button" tabIndex={-1}
              title={t`Drag to change height`} aria-label={t`Drag to change height`}
              className="pointer-events-auto absolute -bottom-1.5 left-1/2 h-3 w-8 -translate-x-1/2 cursor-ns-resize touch-none rounded border-2 border-primary bg-background shadow-sm"
              onPointerDown={event => height.start(event.nativeEvent)} />}
            {!transform.active && !arrange.active && !arrange.ghost && geometry.flow.canSpace && <button
              type="button"
              tabIndex={-1}
              title={t`Drag to change space below`}
              aria-label={t`Drag to change space below`}
              className="pointer-events-auto absolute -bottom-2.5 left-3/4 h-3 w-7 -translate-x-1/2 cursor-ns-resize touch-none rounded-full border-2 border-amber-600 bg-amber-100 shadow-sm"
              onPointerDown={event => { event.preventDefault(); event.stopPropagation(); gestures.start(event.nativeEvent, "space") }}
            />}
          </div>
          {gestures.guide && <div className="absolute h-1 rounded-full bg-primary" style={gestures.guide} />}
          {transform.origin && <div data-transform-origin className="absolute border border-dashed border-teal-600/50" style={transform.origin} />}
          {transform.active && !transform.origin && <button type="button" onClick={transform.stop}
            className="pointer-events-auto absolute rounded-md border border-teal-500 bg-background px-3 py-1.5 text-xs text-teal-700 shadow-sm dark:text-teal-300"
            style={{ left: Math.max(8, Math.min(geometry.box.left, geometry.hostWidth - 160)), top: Math.max(8, geometry.box.top - 52) }}>{t`Done transforming`}</button>}
          {!transform.active && !gestures.dragging && !height.dragging && !arrange.ghost && <FlowToolbar selection={selection} gestures={gestures} layout={layout} arrange={arrange} height={height} container={container} />}
        </div>}
        {arrange.ghost && <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          <div data-arrange-ghost className={`absolute rounded-lg border-2 border-dashed ${arrange.indicator ? "border-violet-600 bg-violet-400/10" : "border-muted-foreground bg-muted/20"}`} style={arrange.ghost}>
            <span className="absolute left-0 top-0 max-w-72 rounded bg-background px-2 py-1 text-xs text-foreground shadow">{arrange.feedback}</span>
          </div>
          {arrange.indicator && <div data-arrange-target className="absolute rounded border-2 border-primary bg-primary/15" style={arrange.indicator} />}
        </div>}
      </div>
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 border-t bg-card px-3 py-2 text-[11px] text-muted-foreground">
        {node && <span className="shrink-0 font-medium text-teal-700 dark:text-teal-300">{t`Inside ${parentTag}`}</span>}
        {node && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5">{t`Edits apply at every screen size`}</span>}
        <span className="flex-1">{node ? hint : t`Select an element to try responsive controls`}</span>
        {container.canWrap && <button type="button" className="shrink-0 rounded-md border bg-background px-2 py-1 font-medium text-foreground hover:bg-accent" onClick={container.request}>{t`Wrap in container`}</button>}
        <span role="status" aria-live="polite" className="font-medium text-primary">{arrange.feedback || height.feedback || gestures.feedback}</span>
      </div>
      <ElementContainerDialog container={container} />
      <StyleGestureTooltip />
    </div>
  )
}
