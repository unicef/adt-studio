import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useLingui } from "@lingui/react/macro"
import { useCanvasPane } from "@/components/app/screens/pipeline/canvas/canvasLayout"
import { cn } from "@/lib/utils"
import { PreviewResizeHandle, type ResizeEdge } from "./PreviewResizeHandle"
import { clampSize, type PreviewSize } from "./previewSize"

const GUTTER = 32
const MIN_SCALE = 0.05
const KEY_STEP = 10
const KEY_STEP_LARGE = 50
const HORIZONTAL_KEYS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
const VERTICAL_KEYS: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 }

interface Drag {
  edge: ResizeEdge
  x: number
  y: number
  size: PreviewSize
  scale: number
}

export interface PreviewFrameProps {
  src: string
  size: PreviewSize
  onResize: (size: PreviewSize) => void
  fullscreen: boolean
}

export function PreviewFrame({ src, size, onResize, fullscreen }: PreviewFrameProps) {
  const { t } = useLingui()
  const paneRef = useRef<HTMLDivElement>(null)
  const { pane } = useCanvasPane(paneRef, true)
  const dragRef = useRef<Drag | null>(null)
  const [dragging, setDragging] = useState(false)

  const scale =
    pane.width && pane.height
      ? Math.max(
          MIN_SCALE,
          Math.min(1, (pane.width - GUTTER * 2) / size.width, (pane.height - GUTTER * 2) / size.height),
        )
      : 1

  const resize = (edge: ResizeEdge, delta: number, from: PreviewSize) =>
    onResize(
      edge === "bottom"
        ? { ...from, height: clampSize(from.height + delta) }
        : { ...from, width: clampSize(from.width + (edge === "left" ? -delta : delta)) },
    )

  const startDrag = (edge: ResizeEdge) => (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { edge, x: event.clientX, y: event.clientY, size, scale }
    setDragging(true)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = drag.edge === "bottom" ? event.clientY - drag.y : event.clientX - drag.x
    resize(drag.edge, (delta * 2) / drag.scale, drag.size)
  }

  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const nudge = (edge: ResizeEdge) => (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = (edge === "bottom" ? VERTICAL_KEYS : HORIZONTAL_KEYS)[event.key]
    if (!direction) return
    event.preventDefault()
    resize(edge, direction * (event.shiftKey ? KEY_STEP_LARGE : KEY_STEP), size)
  }

  const handle = (edge: ResizeEdge, label: string) => (
    <PreviewResizeHandle
      edge={edge}
      label={label}
      value={edge === "bottom" ? size.height : size.width}
      onPointerDown={startDrag(edge)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onKeyDown={nudge(edge)}
    />
  )

  return (
    <div
      ref={paneRef}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-muted/40",
        dragging && "select-none",
      )}
    >
      <div
        className={cn("relative", fullscreen ? "size-full" : "shrink-0")}
        style={
          fullscreen
            ? undefined
            : { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
        }
      >
        <div
          className={cn(
            "size-full overflow-hidden bg-white",
            !fullscreen && "shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/5",
          )}
        >
          <iframe
            src={src}
            title={t`Book preview`}
            className={cn("border-0 bg-white", fullscreen && "size-full", dragging && "pointer-events-none")}
            style={
              fullscreen
                ? undefined
                : {
                    width: size.width,
                    height: size.height,
                    transform: `scale(${scale})`,
                    transformOrigin: "0 0",
                  }
            }
          />
        </div>
        {!fullscreen && (
          <>
            {handle("left", t`Resize width`)}
            {handle("right", t`Resize width`)}
            {handle("bottom", t`Resize height`)}
          </>
        )}
      </div>
    </div>
  )
}
