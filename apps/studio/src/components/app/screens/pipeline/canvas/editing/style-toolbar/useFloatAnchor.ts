import { useState } from "react"
import type { CanvasSelection } from "../CanvasEditing"
import { useCanvasEditing } from "../CanvasEditing"
import { relativeTo, type Box2D } from "./placement"
import { useLayoutTracker } from "./useLayoutTracker"

export interface FloatAnchor {
  rect: Box2D
  bounds: { width: number; height: number }
}

function sameAnchor(a: FloatAnchor | null, b: FloatAnchor | null) {
  if (!a || !b) return a === b
  return (
    a.rect.left === b.rect.left &&
    a.rect.top === b.rect.top &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  )
}

export function useFloatAnchor(
  container: HTMLElement | null,
  selection: CanvasSelection | null,
  enabled: boolean,
  revision: string,
): FloatAnchor | null {
  const { frame } = useCanvasEditing()
  const [anchor, setAnchor] = useState<FloatAnchor | null>(null)
  const key = selection ? `${selection.sectionIndex}:${selection.dataId}:${revision}` : ""

  useLayoutTracker(
    () => {
      if (!container || !selection) return
      const rect = frame(selection.sectionIndex)?.getElementViewportRect(selection.dataId)
      const box = container.getBoundingClientRect()
      const next = rect
        ? {
            rect: relativeTo(
              { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
              { left: Math.round(box.left), top: Math.round(box.top) },
            ),
            bounds: { width: Math.round(box.width), height: Math.round(box.height) },
          }
        : null
      setAnchor((previous) => (sameAnchor(previous, next) ? previous : next))
    },
    {
      enabled: enabled && !!container && !!selection,
      scrollRoot: container,
      resetKey: key,
      observe: () => [container, selection ? (container?.querySelector(`[data-canvas-section="${selection.sectionIndex}"]`) ?? null) : null],
    },
  )

  return enabled && selection ? anchor : null
}
