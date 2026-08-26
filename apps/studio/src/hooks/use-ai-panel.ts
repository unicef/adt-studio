import { createPanelStore } from "./create-panel-store"

const store = createPanelStore("adt.ai-panel", true)

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
