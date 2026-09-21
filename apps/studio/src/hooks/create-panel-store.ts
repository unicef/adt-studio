import { useSyncExternalStore } from "react"

/**
 * A module-level open/closed store backed by localStorage. Panels are mounted by
 * more than one screen, so component state would drift between them — this keeps
 * every mount in step with the others, with other tabs, and across reloads.
 */
export function createPanelStore(storageKey: string, defaultOpen: boolean) {
  function read(): boolean {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === "open") return true
      if (raw === "closed") return false
      return defaultOpen
    } catch {
      return defaultOpen
    }
  }

  let current = read()
  const listeners = new Set<() => void>()

  function emit() {
    for (const listener of listeners) listener()
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== storageKey) return
      current = read()
      emit()
    })
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function get(): boolean {
    return current
  }

  function set(open: boolean) {
    current = open
    try {
      localStorage.setItem(storageKey, open ? "open" : "closed")
    } catch {
      /* ignore */
    }
    emit()
  }

  function useOpen() {
    return [useSyncExternalStore(subscribe, get), set] as const
  }

  return { get, set, useOpen }
}
