import { createPanelStore } from "./create-panel-store"
import { createPersistentStore } from "./create-persistent-store"

const store = createPanelStore("adt.ai-panel", true)

export const AI_PANEL_MIN_WIDTH = 320
export const AI_PANEL_MAX_WIDTH = 720
export const AI_PANEL_DEFAULT_WIDTH = 440

export function clampAiPanelWidth(width: number): number {
  return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(width)))
}

function isWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= AI_PANEL_MIN_WIDTH &&
    value <= AI_PANEL_MAX_WIDTH
  )
}

const widthStore = createPersistentStore<number>(
  "adt.ai-panel-width",
  AI_PANEL_DEFAULT_WIDTH,
  isWidth,
)

export function getAiPanelOpen(): boolean {
  return store.get()
}

export function setAiPanelOpen(open: boolean) {
  store.set(open)
}

/** Whether the "Edit with AI" rail is expanded. */
export function useAiPanelOpen() {
  return store.useOpen()
}

/** Rail width in pixels, as dragged by the user. */
export function useAiPanelWidth() {
  return widthStore.use()
}
