import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react"
import { getDeviceFrame } from "@/components/pipeline/stages/storyboard/components/style-editor/device-chrome"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { zoomBy } from "./zoom"

export const CAPTURE_WIDTH: Record<Viewport, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
}

export const CANVAS_PADDING = 48
export const DEVICE_PADDING = 64
export const DOCK_CLEARANCE = 96
export const DOCK_HANDLE_CLEARANCE = 40
export const FIT_MAX_SCALE = 1.5
export const DEVICE_FIT_MAX_SCALE = 2
export const DEVICE_MIN_FIT_SCALE = 0.7
const DESKTOP_FALLBACK_WIDTH = 760

export interface CanvasPane {
  width: number
  height: number
}

let lastPane: CanvasPane = { width: 0, height: 0 }

function samePane(a: CanvasPane, b: CanvasPane): boolean {
  return a.width === b.width && a.height === b.height
}

export function useCanvasPane(ref: RefObject<HTMLDivElement | null>, attached: boolean) {
  const [pane, setPane] = useState<CanvasPane>(lastPane)
  // The content width follows the pane, so an animated width would lag a whole
  // 200ms behind the window while dragging. Suspend it until the drag settles.
  const [resizing, setResizing] = useState(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measured = { width: node.clientWidth, height: node.clientHeight }
    if (measured.width && !samePane(measured, lastPane)) {
      lastPane = measured
      setPane(measured)
    }
    let settle: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height }
      if (samePane(next, lastPane)) return
      lastPane = next
      setPane(next)
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

export function desktopFitScale(pane: CanvasPane): number {
  const width = pane.width ? pane.width - CANVAS_PADDING : DESKTOP_FALLBACK_WIDTH
  return Math.max(0, Math.min(FIT_MAX_SCALE, width / CAPTURE_WIDTH.desktop))
}

export function canvasPageScale(viewport: Viewport, pane: CanvasPane, zoom: number): number {
  if (viewport !== "desktop") return 1
  return desktopFitScale(pane) * zoom
}

export function canvasContentWidth(viewport: Viewport, pane: CanvasPane, zoom: number): number {
  return Math.round(CAPTURE_WIDTH[viewport] * canvasPageScale(viewport, pane, zoom))
}

export interface DeviceChrome {
  chromeWidth: number
  chromeHeight: number
}

export function deviceFitScale(chrome: DeviceChrome, available: CanvasPane): number {
  if (available.width <= 0 || available.height <= 0) return 1
  const byWidth = available.width / chrome.chromeWidth
  const byHeight = Math.max(DEVICE_MIN_FIT_SCALE, available.height / chrome.chromeHeight)
  return Math.max(0, Math.min(DEVICE_FIT_MAX_SCALE, byWidth, byHeight))
}

export function canvasDeviceFit(viewport: Exclude<Viewport, "desktop">, available: CanvasPane): number {
  return deviceFitScale(getDeviceFrame(viewport, CAPTURE_WIDTH[viewport]), available)
}

export function deviceAvailable(pane: CanvasPane, dockMinimized: boolean): CanvasPane {
  return {
    width: pane.width - CANVAS_PADDING,
    height: pane.height - DEVICE_PADDING - (dockMinimized ? DOCK_HANDLE_CLEARANCE : DOCK_CLEARANCE),
  }
}

let publishedFit = 1
const fitListeners = new Set<() => void>()

export function publishCanvasFit(scale: number) {
  if (scale === publishedFit) return
  publishedFit = scale
  for (const listener of fitListeners) listener()
}

function subscribeFit(listener: () => void) {
  fitListeners.add(listener)
  return () => {
    fitListeners.delete(listener)
  }
}

export function useCanvasFit(): number {
  return useSyncExternalStore(subscribeFit, () => publishedFit, () => 1)
}
