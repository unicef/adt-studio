import { useSyncExternalStore } from "react"

export const UI_VERSIONS = ["new", "old"] as const

export type UiVersion = (typeof UI_VERSIONS)[number]

const STORAGE_KEY = "adt.ui"

const DEFAULT_VERSION: UiVersion = "new"

function read(): UiVersion {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return UI_VERSIONS.includes(raw as UiVersion) ? (raw as UiVersion) : DEFAULT_VERSION
  } catch {
    return DEFAULT_VERSION
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

export function getUiVersion(): UiVersion {
  return current
}

export function setUiVersion(version: UiVersion) {
  current = version
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    /* ignore */
  }
  emit()
}

export function useUiVersion() {
  return [useSyncExternalStore(subscribe, getUiVersion), setUiVersion] as const
}
