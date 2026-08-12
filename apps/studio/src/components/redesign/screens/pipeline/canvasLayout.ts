import { useEffect, useState, type RefObject } from "react"
import type { Viewport } from "./types"
import { zoomBy } from "./zoom"

/** Widths the sections are rendered and captured at (`SCREENSHOT_VIEWPORTS`).
 *  Tablet and mobile lay their device screen out at exactly this width, so the
 *  render is 1:1; desktop displays its capture across whatever the pane gives. */
export const CAPTURE_WIDTH: Record<Viewport, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
}

export const CANVAS_PADDING = 48
/** px-6 on both sides plus pt-6 / pb-10 around the device. */
export const DEVICE_PADDING = 64
const DESKTOP_FALLBACK_WIDTH = 760

export interface CanvasPane {
  width: number
  height: number
}

export function useCanvasPane(ref: RefObject<HTMLDivElement | null>, attached: boolean) {
  const [pane, setPane] = useState<CanvasPane>({ width: 0, height: 0 })
  // The content width follows the pane, so an animated width would lag a whole
  // 200ms behind the window while dragging. Suspend it until the drag settles.
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    setPane({ width: node.clientWidth, height: node.clientHeight })
    let settle: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(([entry]) => {
      setPane({ width: entry.contentRect.width, height: entry.contentRect.height })
      setResizing(true)
      clearTimeout(settle)
      settle = setTimeout(() => setResizing(false), 150)
    })
    observer.observe(node)
    return () => {
      clearTimeout(settle)
      observer.disconnect()
    }
  }, [ref, attached])

  return { pane, resizing }
}

export function useCanvasWheelZoom(
  ref: RefObject<HTMLDivElement | null>,
  zoom: number,
  onZoomChange: (zoom: number) => void,
) {
  useEffect(() => {
    const node = ref.current
    if (!node) return
    // Registered manually: React's onWheel is passive, so preventDefault there
    // cannot stop the browser from zooming the whole app instead.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onZoomChange(zoomBy(zoom, event.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    node.addEventListener("wheel", onWheel, { passive: false })
    return () => node.removeEventListener("wheel", onWheel)
  }, [ref, zoom, onZoomChange])
}

export function canvasContentWidth(viewport: Viewport, pane: CanvasPane, zoom: number): number {
  if (viewport !== "desktop") return CAPTURE_WIDTH[viewport]
  const desktopWidth = pane.width ? pane.width - CANVAS_PADDING : DESKTOP_FALLBACK_WIDTH
  return Math.round(desktopWidth * zoom)
}
