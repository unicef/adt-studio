import { createPersistentStore } from "@/hooks/create-persistent-store"
import { ZOOM_MAX, ZOOM_MIN } from "@/components/app/screens/pipeline/canvas/zoom"
import type { Viewport } from "./types"

const isViewport = (value: unknown): value is Viewport =>
  value === "desktop" || value === "tablet" || value === "mobile"
const isZoom = (value: unknown): value is number =>
  typeof value === "number" && value >= ZOOM_MIN && value <= ZOOM_MAX
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"

const viewportStore = createPersistentStore<Viewport>(
  "adt.pipeline.viewport",
  "desktop",
  isViewport,
)
const zoomStore = createPersistentStore<number>("adt.pipeline.zoom", 1, isZoom)
const dockMinimizedStore = createPersistentStore<boolean>(
  "adt.pipeline.dock-minimized",
  false,
  isBoolean,
)

const isPageMap = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === "string")

const lastPageStore = createPersistentStore<Record<string, string>>(
  "adt.pipeline.last-page",
  {},
  isPageMap,
)

/** Device width the canvas renders sections at. */
export const useCanvasViewport = viewportStore.use
/** Canvas scale, clamped to the zoom controls' own range. */
export const useCanvasZoom = zoomStore.use
/** Whether the plugin dock is slid off the bottom edge, down to its handle. */
export const useDockMinimized = dockMinimizedStore.use

export const canvasViewport = viewportStore
export const canvasZoom = zoomStore
export const dockMinimized = dockMinimizedStore

export function rememberLastPage(label: string, pageId: string) {
  lastPageStore.set((previous) =>
    previous[label] === pageId ? previous : { ...previous, [label]: pageId },
  )
}

export function lastPage(label: string): string | undefined {
  return lastPageStore.get()[label]
}
