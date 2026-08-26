import { useSyncExternalStore, type Dispatch, type SetStateAction } from "react"

export interface PersistentStore<T> {
  get: () => T
  set: Dispatch<SetStateAction<T>>
  use: () => [T, Dispatch<SetStateAction<T>>]
}

/**
 * A module-level store backed by localStorage, in the shape of `useState`. Use
 * it for preferences read by more than one screen — component state would drift
 * between mounts, while this keeps every mount, every tab and every reload in
 * step. `isValid` guards what comes back, so an entry left by an older build —
 * or hand-edited in devtools — falls back to the default instead of reaching the
 * UI. Storage access is best-effort: private mode and disabled storage throw.
 */
export function createPersistentStore<T>(
  storageKey: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): PersistentStore<T> {
  function read(): T {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === null) return fallback
      const parsed: unknown = JSON.parse(raw)
      return isValid(parsed) ? parsed : fallback
    } catch {
      return fallback
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

  function get(): T {
    return current
  }

  const set: Dispatch<SetStateAction<T>> = (value) => {
    const next =
      typeof value === "function" ? (value as (previous: T) => T)(current) : value
    if (Object.is(next, current)) return
    current = next
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* persistence is best-effort */
    }
    emit()
  }

  function use(): [T, Dispatch<SetStateAction<T>>] {
    return [useSyncExternalStore(subscribe, get, get), set]
  }

  return { get, set, use }
}
