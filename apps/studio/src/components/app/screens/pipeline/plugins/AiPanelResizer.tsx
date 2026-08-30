import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { useLingui } from "@lingui/react/macro"
import {
  AI_PANEL_DEFAULT_WIDTH,
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  clampAiPanelWidth,
} from "@/hooks/use-ai-panel"
import { cn } from "@/lib/utils"

const KEYBOARD_STEP = 24

function setDragCursor(dragging: boolean) {
  document.body.style.userSelect = dragging ? "none" : ""
  document.body.style.cursor = dragging ? "col-resize" : ""
}

export interface AiPanelResizerProps {
  width: number
  onWidth: Dispatch<SetStateAction<number>>
  onDraggingChange: (dragging: boolean) => void
}

export function AiPanelResizer({ width, onWidth, onDraggingChange }: AiPanelResizerProps) {
  const { t } = useLingui()
  const start = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => () => setDragCursor(false), [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      start.current = { x: event.clientX, width }
      setDragCursor(true)
      onDraggingChange(true)
    },
    [onDraggingChange, width],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = start.current
      if (!origin) return
      onWidth(clampAiPanelWidth(origin.width + (origin.x - event.clientX)))
    },
    [onWidth],
  )

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!start.current) return
      start.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
      setDragCursor(false)
      onDraggingChange(false)
    },
    [onDraggingChange],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        event.key === "ArrowLeft" ? KEYBOARD_STEP : event.key === "ArrowRight" ? -KEYBOARD_STEP : 0
      if (step === 0) return
      event.preventDefault()
      // Arrow keys also page through the storyboard; resizing owns them here.
      event.stopPropagation()
      onWidth((current) => clampAiPanelWidth(current + step))
    },
    [onWidth],
  )

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t`Resize the AI panel`}
      aria-valuenow={width}
      aria-valuemin={AI_PANEL_MIN_WIDTH}
      aria-valuemax={AI_PANEL_MAX_WIDTH}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onWidth(AI_PANEL_DEFAULT_WIDTH)}
      className={cn(
        "group absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-brand-500/60 group-focus-visible:bg-brand-500/60"
      />
    </div>
  )
}
