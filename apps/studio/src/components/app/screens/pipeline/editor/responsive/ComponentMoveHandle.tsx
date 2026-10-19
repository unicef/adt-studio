import { useState } from "react"
import { createPortal } from "react-dom"
import { useLingui } from "@lingui/react/macro"
import { GripVertical } from "lucide-react"
import type { useFlowSelection } from "./useFlowSelection"
import type { useComponentLayout } from "./useComponentLayout"
import type { useArrangeGesture } from "./useArrangeGesture"

export function ComponentMoveHandle({ selection, layout, arrange }: {
  selection: ReturnType<typeof useFlowSelection>; layout: ReturnType<typeof useComponentLayout>; arrange: ReturnType<typeof useArrangeGesture>
}) {
  const { t } = useLingui()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const { geometry, host } = selection
  if (!layout.component || !geometry || !host.current) return null
  const rect = layout.component.getBoundingClientRect(), bounds = host.current.getBoundingClientRect()
  const box = { left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height }
  const tag = layout.component.tagName.toLowerCase()
  return <>
    {layout.canArrange && (hovered || focused || arrange.active) && createPortal(
      <div data-component-move-outline className="pointer-events-none absolute z-20 rounded-sm border-2 border-dashed border-violet-600" style={box} />,
      host.current,
    )}
    <button type="button" data-component-move-handle aria-label={t`Drag to reposition component`}
      title={arrange.active ? t`Drag the component · click to cancel` : t`Drag to reposition · click to activate`}
      aria-pressed={arrange.active} disabled={!layout.canArrange}
      className={`flex h-8 shrink-0 cursor-grab touch-none items-center gap-1.5 rounded-md border border-violet-300 px-2 text-xs text-violet-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing disabled:cursor-default disabled:opacity-30 dark:text-violet-300 dark:hover:bg-violet-950 ${arrange.active ? "bg-violet-100 dark:bg-violet-950" : "bg-violet-50/50 dark:bg-violet-950/30"}`}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onPointerDown={event => arrange.start(event.nativeEvent)}
      onClick={arrange.toggle}>
      <GripVertical className="size-4" aria-hidden />{t`Reposition`}<span className="font-mono text-[10px] opacity-60">{tag}</span>
    </button>
  </>
}
