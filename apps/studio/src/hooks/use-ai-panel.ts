import { useSyncExternalStore } from "react"

const STORAGE_KEY = "adt.ai-panel"

const DEFAULT_OPEN = true

function read(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === "open") return true
    if (raw === "closed") return false
    return DEFAULT_OPEN
  } catch {
    return DEFAULT_OPEN
  }
}

let current = read()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    current = read()
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAiPanelOpen(): boolean {
  return current
}

export function setAiPanelOpen(open: boolean) {
  current = open
  try {
    localStorage.setItem(STORAGE_KEY, open ? "open" : "closed")
  } catch {
    /* ignore */
  }
  emit()
}

/**
 * Whether the "Edit with AI" rail is expanded. A module-level store rather than
 * component state: the rail is mounted by both the pipeline screen and each step
 * workspace, so this keeps them in step with each other as well as across
 * reloads.
 */
export function useAiPanelOpen() {
  return [useSyncExternalStore(subscribe, getAiPanelOpen), setAiPanelOpen] as const
}
