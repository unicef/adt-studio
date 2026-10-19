import { createPortal } from "react-dom"
import { useLingui } from "@lingui/react/macro"
import { useStyleInspection } from "./StyleInspection"
import { StyleChangeList } from "./StyleChangeList"

export function StyleGestureTooltip() {
  const { t } = useLingui()
  const state = useStyleInspection()
  if (!state?.preview?.entries.some(entry => entry.rows.length)) return null
  const { entries, point, bounds } = state.preview
  return createPortal(<div role="tooltip" aria-label={t`Changing styles`}
    className="pointer-events-none fixed z-50 w-60 max-w-[calc(100vw-16px)] rounded-md border bg-card p-2 text-foreground shadow-lg"
    style={{ left: Math.max((bounds?.left ?? 0) + 8, Math.min(point.x + 18, (bounds?.right ?? window.innerWidth) - 256)), top: Math.max((bounds?.top ?? 0) + 8, Math.min(point.y + 18, (bounds?.bottom ?? window.innerHeight) - 256)) }}>
    <div className="max-h-60 overflow-hidden"><StyleChangeList entries={entries} /></div>
  </div>, document.body)
}
